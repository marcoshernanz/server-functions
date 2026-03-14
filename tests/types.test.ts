import { z } from "zod";

import { definePolicy, serverFunction } from "../src/index.js";

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

const requireOrganizationOwner = definePolicy<
  { organization: Organization; user: User },
  {}
>(async (context) => {
  if (context.organization.id !== "org_123" || context.user.id !== "user_123") {
    throw new Error("Forbidden");
  }

  return {};
});

const rateLimitByIp = definePolicy(async () => {
  return {};
});

const updateProfile = serverFunction({
  input: z.object({
    bio: z.string().min(10).max(160),
  }),
  policies: [requireUser, rateLimitByIp],
  handler: async (context, input) => {
    type InputMatchesSchema = Expect<
      Equal<typeof input, { bio: string }>
    >;
    type UserIsAvailable = Expect<Equal<typeof context.user, User>>;

    context.headers.get("x-request-id");
    context.ip;
    context.requestId;

    return {
      ok: true as const,
      bio: input.bio,
      userId: context.user.id,
    };
  },
});

const organizationInviteInput = z
  .string()
  .email()
  .transform((email) => ({ email }));

const createOrganizationInvite = serverFunction({
  input: organizationInviteInput,
  policies: [
    requireUser,
    loadOrganization("acme"),
    requireOrganizationOwner,
    rateLimitByIp,
  ],
  handler: async (context, input) => {
    type InputIsParsedOutput = Expect<Equal<typeof input, { email: string }>>;
    type UserIsAvailable = Expect<Equal<typeof context.user, User>>;
    type OrganizationIsAvailable = Expect<
      Equal<typeof context.organization, Organization>
    >;

    context.headers.get("x-request-id");
    context.ip;
    context.requestId;

    return {
      ok: true as const,
      inviteeEmail: input.email,
      organizationSlug: context.organization.slug,
      userId: context.user.id,
    };
  },
});

type UpdateProfileInput = Parameters<typeof updateProfile>[0];
type UpdateProfileInputInferenceWorks = Expect<
  Equal<UpdateProfileInput, { bio: string }>
>;

type InviteClientInput = Parameters<typeof createOrganizationInvite>[0];
type InviteClientInputUsesSchemaInput = Expect<Equal<InviteClientInput, string>>;

type InviteResult = Awaited<ReturnType<typeof createOrganizationInvite>>;
type InviteResultInferenceWorks = Expect<
  Equal<
    InviteResult,
    {
      ok: true;
      inviteeEmail: string;
      organizationSlug: string;
      userId: string;
    }
  >
>;

updateProfile({ bio: "This is a valid profile bio." });
createOrganizationInvite("person@example.com");

// @ts-expect-error Client input should come from the schema input type.
updateProfile("abc");

// @ts-expect-error Transformed schema input should still accept the schema input type.
createOrganizationInvite({ email: "person@example.com" });

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

// @ts-expect-error Reserved context keys should be rejected.
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
