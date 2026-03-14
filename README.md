# Safer Server Functions Prototype

This repo is a prototype for a safer, more toolable layer on top of Next.js Server Functions.

The idea is not to replace raw `'use server'`. The idea is to offer an opt-in API for higher-risk exported Server Functions where auth, validation, and tooling matter most:

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

## What This Repo Proves

- a clear `serverFunction({ input, policies, handler })` API
- `definePolicy(...)` for reusable guardrails
- Standard Schema-based type inference
- a small executable runtime
- ESLint rules that understand and migrate toward the API

## Start Here

1. Read [PITCH.md](./PITCH.md).
2. Open [examples/serverFunctions.ts](./examples/serverFunctions.ts).
3. Open [src/index.ts](./src/index.ts).

## Quick Check

```bash
npm install
npm run typecheck
npm run test:runtime
npm run test:eslint
```

## Repo Map

- [examples/README.md](./examples/README.md): small example walkthrough
- [tests/types.test.ts](./tests/types.test.ts): type-level proof
- [tests/runtime.test.ts](./tests/runtime.test.ts): runtime proof
- [tests/eslint.test.ts](./tests/eslint.test.ts): tooling proof
- [JIMMY_DM.md](./JIMMY_DM.md): short DM draft
