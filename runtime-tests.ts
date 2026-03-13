import { z } from "zod";

import { definePolicy, serverFunction } from "./src/index.js";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(message);
  }
}

async function expectReject(
  promise: Promise<unknown>,
  expectedMessage: string,
): Promise<Error & { issues?: unknown }> {
  try {
    await promise;
  } catch (error) {
    assert(error instanceof Error, "Expected an Error instance");
    assert(
      error.message === expectedMessage,
      `Expected "${expectedMessage}" but got "${error.message}"`,
    );

    return error as Error & { issues?: unknown };
  }

  throw new Error(`Expected promise to reject with "${expectedMessage}"`);
}

const requireUser = definePolicy(async () => {
  return {
    user: {
      id: "user_123",
      email: "user@example.com",
    },
  };
});

const addSubject = definePolicy(async ({ ip }) => {
  return { subject: ip ?? "unknown" };
});

const denyAccess = definePolicy(async () => {
  throw new Error("Unauthorized");
});

const updateProfile = serverFunction({
  input: z.object({
    bio: z.string().min(10).max(160),
  }),
  policies: [requireUser, addSubject],
  handler: async (context, input) => {
    return {
      bio: input.bio,
      subject: context.subject,
      userId: context.user.id,
    };
  },
});

const validResult = await updateProfile({
  bio: "This is a valid profile bio.",
});

assert(validResult.bio === "This is a valid profile bio.", "Valid input failed");
assert(validResult.subject === "127.0.0.1", "Policy output was not merged");
assert(validResult.userId === "user_123", "User context was not available");

const invalidInputError = await expectReject(
  updateProfile({ bio: "short" }),
  "Invalid input",
);

assert(Array.isArray(invalidInputError.issues), "Validation issues were missing");
assert(invalidInputError.issues.length > 0, "Validation issues were empty");

const protectedAction = serverFunction({
  input: z.object({}),
  policies: [denyAccess],
  handler: async () => {
    return { ok: true };
  },
});

await expectReject(
  protectedAction({}),
  "Unauthorized",
);

const duplicateSubject = definePolicy(async () => {
  return { subject: "duplicate" };
});

const runtimeCollision = serverFunction({
  input: z.object({}),
  policies: [addSubject, duplicateSubject] as unknown as [],
  handler: async () => {
    return { ok: true };
  },
} as any);

await expectReject(
  runtimeCollision({}),
  "Context key collision at runtime: subject",
);
