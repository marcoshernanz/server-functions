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

The interesting part is not only the runtime wrapper. The shape is structured enough that lint rules, editors, and AI agents can understand what kind of function this is and what safety checks apply to it.

## Why It Is Interesting

- structured enough for lint rules, codemods, editors, and agent tooling
- easier to reason about than a plain exported async function
- more explicit than raw `'use server'`
- better fit than adding more magic strings

## Why This Might Belong In Next.js

A userland library is enough to prove the API shape, but there is also a case for framework ownership:

- Next.js already knows which exports are client-callable server endpoints
- the framework can pair the API with lint rules, codemods, docs, and editor support
- framework ownership gives the safety story a canonical shape instead of leaving teams to invent their own wrappers
- this could stay additive, so raw `'use server'` still exists for lower-level or lower-risk cases

## Important Constraint

This is not meant to replace raw `'use server'`. It makes more sense as an additive safe layer for exported client-callable functions and mutations where explicitness and tooling matter.

## What This Repo Proves

- ESLint rules that can understand and migrate toward the API
- strong type inference from Standard Schema-compatible validators
- typed policy composition into `context`
- a small executable runtime

## Open Questions

- should something like `policies` live in framework core, or should Next.js only expose hooks that libraries build on top of
- is `serverFunction(...)` the right level of ceremony, or does it feel too heavy for smaller actions
- should Next.js bless one explicit wrapper shape, or should it solve some of the same problems with compiler metadata instead
- how should this interact with existing Server Function ergonomics, especially if the team wants to avoid making the model feel even more magical
