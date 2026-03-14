# Pitch

This repo is a prototype for making higher-risk Next.js Server Functions safer, clearer, and more tooling-friendly.

## Problem

Today, a Server Function can look too much like a normal function even though it is really a remote mutation endpoint.

That creates three problems:

- auth and authorization are easy to forget
- input validation is easy to forget
- tooling has very little structured metadata to reason about

## Proposed Direction

Use an explicit opt-in API:

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

This keeps the action boundary explicit and gives tooling a stable shape to inspect.

This is not meant to replace every use of raw `'use server'`. The stronger claim is that Next.js should have a structured safe layer for exported client-callable functions and mutations where auth, validation, and tooling matter most.

## Why This Is Better Than Magic Strings

- Safety metadata is visible in code instead of hidden in directives like `"use server - auth"`.
- Policies are composable and typed.
- Input validation is part of the definition.
- Tools can reason about the structure without guessing intent from arbitrary function bodies.

## What This Is Not

- It is not a proposal to replace the raw React `'use server'` primitive.
- It is not a claim that every Server Function should use this shape.
- It is not a full framework rewrite.

The intended role is an additive, opt-in safe layer for the cases where the default primitive is too implicit and too hard for tooling to understand.

## What This Repo Proves

- Strong TypeScript inference from Standard Schema-compatible validators
- Typed policy composition into `context`
- Runtime execution with validation and policy enforcement
- Runtime and compile-time rejection of policy key collisions
- ESLint rules that can:
  - prefer `serverFunction(...)` in `'use server'` modules
  - catch `data: input` mass-assignment patterns
  - suggest a migration skeleton toward the new API

## Why This Could Be A Good Intern Project

This can be scoped as a layered exploration instead of a full framework rewrite:

1. Define and prototype the API surface
2. Prove the runtime model
3. Build migration and safety tooling around that model

That maps well to the discussion about framework support, editor/tooling support, and AI-aware tooling.
