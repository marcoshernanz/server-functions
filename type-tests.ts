import { z } from "zod";

import { definePolicy, serverFunction } from "./src/index.js";

type Equal<TLeft, TRight> = (<T>() => T extends TLeft ? 1 : 2) extends <
  T,
>() => T extends TRight ? 1 : 2
  ? true
  : false;

type Expect<TValue extends true> = TValue;

type User = {
  id: string;
  email: string;
};

type Organization = {
  id: string;
  slug: string;
};

const requireUser = definePolicy(async () => {
  const user: User = {
    id: "user_123",
    email: "user@example.com",
  };

  return { user };
});

const loadOrganization = (slug: string) =>
  definePolicy(async () => {
    const organization: Organization = {
      id: "org_123",
      slug,
    };

    return { organization };
  });

const rateLimitByIp = definePolicy(async () => {
  return {};
});

const transformedSchema = z.string().transform((value) => value.length);

const updateProfile = serverFunction({
  input: transformedSchema,
  policies: [requireUser, loadOrganization("acme"), rateLimitByIp],
  handler: async (context, input) => {
    type InputIsParsedOutput = Expect<Equal<typeof input, number>>;
    type UserIsAvailable = Expect<Equal<typeof context.user, User>>;
    type OrganizationIsAvailable = Expect<
      Equal<typeof context.organization, Organization>
    >;

    context.headers.get("x-request-id");
    context.ip;
    context.requestId;

    return {
      ok: true as const,
      length: input,
      organizationSlug: context.organization.slug,
      userId: context.user.id,
    };
  },
});

type ClientInput = Parameters<typeof updateProfile>[0];
type ClientInputUsesSchemaInput = Expect<Equal<ClientInput, string>>;

type Result = Awaited<ReturnType<typeof updateProfile>>;
type ResultInferenceWorks = Expect<
  Equal<
    Result,
    {
      ok: true;
      length: number;
      organizationSlug: string;
      userId: string;
    }
  >
>;

updateProfile("abc");

// @ts-expect-error Client input should come from the schema input type.
updateProfile(123);

const duplicateUser = definePolicy(async () => {
  return {
    user: {
      id: "other",
      email: "other@example.com",
    } satisfies User,
  };
});

// @ts-expect-error Duplicate context keys should be rejected.
serverFunction({
  input: z.object({}),
  policies: [requireUser, duplicateUser],
  handler: async () => ({ ok: true as const }),
});

const badHeaders = definePolicy(async () => {
  return { headers: "not allowed" };
});

// @ts-expect-error Reserved context keys should not be allowed.
serverFunction({
  input: z.object({}),
  policies: [badHeaders],
  handler: async () => ({ ok: true as const }),
});

const notStandardSchema = { parse: () => ({}) };

serverFunction({
  // @ts-expect-error Input must satisfy the Standard Schema contract.
  input: notStandardSchema,
  policies: [],
  handler: async () => ({ ok: true as const }),
});
