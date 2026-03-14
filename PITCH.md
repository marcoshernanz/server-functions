# Pitch

This repo explores an opt-in safe layer for higher-risk Next.js Server Functions.

## Problem

Exported Server Functions are easy to confuse with normal functions even though they are really remote mutation endpoints.

That leads to two common problems:

### 1. Bad auth / identity

```ts
export async function updateProfile(userId: string, data: ProfileInput) {
  await db.user.update({
    where: { id: userId },
    data,
  });
}
```

The client should not decide which user is being mutated. `policies: [requireUser]` moves identity and authorization back to the server.

### 2. Bad runtime input

```ts
export async function updateProfile(data: { name: string }) {
  await db.user.update({ data });
}
```

TypeScript does not validate runtime input. `input: schema` makes parsing explicit and typed before the handler runs.

`input` uses Standard Schema, so the solution stays validator-agnostic instead of forcing one specific library.

## Proposed Direction

Use an explicit API:

```ts
export const updateProfile = serverFunction({
  input: z.object({ name: z.string().min(1).max(40) }),
  policies: [requireUser, rateLimitByIp],
  handler: async (context, input) => {
    await db.user.update({
      where: { id: context.user.id },
      data: { name: input.name },
    });

    return { ok: true };
  },
});
```

## Why It Is Interesting

- more explicit than raw `'use server'`
- easier to lint and reason about
- structured enough for editor and agent tooling
- better fit than adding more magic strings

## Important Constraint

This is not meant to replace raw `'use server'`. It makes more sense as an additive safe layer for exported client-callable functions and mutations where explicitness and tooling matter.

## What This Repo Proves

- strong type inference from Standard Schema-compatible validators
- typed policy composition into `context`
- a small executable runtime
- ESLint rules that can understand and migrate toward the API
