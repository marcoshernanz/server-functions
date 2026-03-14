# Pitch

This repo explores an opt-in safe layer for higher-risk Next.js Server Functions.

## Problem

Exported Server Functions are easy to confuse with normal functions even though they are really remote mutation endpoints. That makes auth, input validation, and tooling much harder than they should be.

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
