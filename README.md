# Safe Server Functions Exploration

This repo explores how Next.js could make Server Functions safer without making them significantly harder to use.

React and Next.js now use the term "Server Functions" in their official docs. This document follows that naming, even though the problem space has often been discussed as "safe server actions".

The problem is not just security. It is also readability and tooling:

- Server Functions can look too similar to ordinary functions.
- Important guardrails such as auth, authorization, input validation, origin checks, and rate limiting are easy to forget.
- The safety model is not very visible to editors, static analysis, or AI agents.

The goal of this document is to compare the main approaches, identify the tradeoffs, and recommend an initial direction to prototype.

## Motivation

This problem is not hypothetical.

- React says arguments to Server Functions are fully client-controlled and must be treated as untrusted input.
- React also allows plain objects with serializable properties to be passed as Server Function arguments.
- Next.js says exported Server Actions should be treated like public HTTP endpoints and that input should always be validated and authorization should always be enforced.

See the official docs for [React Server Functions](https://react.dev/reference/rsc/use-server), [Next.js use server](https://nextjs.org/docs/app/api-reference/directives/use-server), and [Next.js data security guidance](https://nextjs.org/docs/app/guides/data-security).

That means a Server Function that looks like an ordinary TypeScript function can quietly become a remote mutation endpoint with attacker-controlled inputs.

### 1. Insecure direct object reference

This looks innocent:

```ts
'use server';

export async function updateProfile(
  userId: string,
  data: { name: string; surname: string }
) {
  await db.user.update({
    where: { id: userId },
    data,
  });
}
```

But this function trusts a client-supplied `userId`. If this function is reachable from the client, a malicious user can attempt to update someone else's record simply by sending a different ID:

```ts
await updateProfile("victim_user_id", {
  name: "Mallory",
  surname: "OwnsYourAccount",
});
```

This is a classic insecure direct object reference. The client should not get to decide which user record is being mutated.

The minimum fix is to derive identity on the server and reject unauthenticated callers:

```ts
'use server';

export async function updateProfile(
  data: { name: string; surname: string }
) {
  const session = await authenticate();

  if (!session?.user) {
    throw new Error("Unauthorized");
  }

  await db.user.update({
    where: { id: session.user.id },
    data,
  });
}
```

That closes one hole, but it still is not enough.

### 2. Mass assignment / over-posting

This version no longer trusts a client-provided `userId`:

```ts
'use server';

export async function updateProfile(
  data: { name: string; surname: string }
) {
  const session = await authenticate();

  if (!session?.user) {
    throw new Error("Unauthorized");
  }

  await db.user.update({
    where: { id: session.user.id },
    data,
  });
}
```

It still looks safe. It still is not.

TypeScript types are erased at runtime. The caller is not forced to send exactly `{ name, surname }`, and React explicitly allows plain serializable objects as Server Function arguments. A malicious caller can try to send extra fields:

```ts
await updateProfile({
  name: "Mallory",
  surname: "Root",
  role: "admin",
  emailVerified: true,
  billingPlan: "enterprise",
} as any);
```

If the function forwards `data` directly into a generic write path, those extra fields can survive all the way into the database update. That is how a "harmless profile update" turns into privilege escalation or unauthorized account mutation.

The minimum safe pattern is to parse and constrain the payload on the server before writing anything:

```ts
'use server';

import { z } from "zod";

const UpdateProfileInput = z
  .object({
    name: z.string().min(1).max(100),
    surname: z.string().min(1).max(100),
  })
  .strict();

export async function updateProfile(rawData: unknown) {
  const session = await authenticate();

  if (!session?.user) {
    throw new Error("Unauthorized");
  }

  const data = UpdateProfileInput.parse(rawData);

  await db.user.update({
    where: { id: session.user.id },
    data,
  });
}
```

This is the core motivation for the rest of this document:

- a Server Function should not look like an ordinary function if it is actually a public mutation endpoint
- authorization should not be easy to forget
- input parsing should not be an optional afterthought
- the safe path should be more obvious than the dangerous path

## Safety Goals

Any proposal should try to improve at least some of the following:

- Explicitness: make it obvious that a Server Function is not a normal function.
- Enforceability: make common guardrails hard to forget.
- Extensibility: support more than a single boolean like auth or no-auth.
- Toolability: expose enough structure for lint rules, editors, LSPs, and agent tooling.
- Incremental adoption: let existing apps adopt it without a full rewrite.
- Framework fit: keep the model understandable within Next.js.

## Evaluation Axes

The options below are compared across these axes:

- Explicitness: how clearly the code signals "this is a server function".
- Safety guarantees: how well the approach can enforce auth, validation, or similar checks.
- Tooling fit: how well static analysis, editor tooling, and build-time diagnostics can understand the model.
- AI fit: how usable the approach is for agentic workflows, codegen, and automated refactors.
- Migration cost: how disruptive the approach would be for existing apps.
- Framework cost: how much API, compiler, and maintenance burden it adds to Next.js.

## Options

| Option | Example shape | Explicitness | Safety guarantees | Tooling fit | AI fit | Migration cost | Framework cost | Pros | Cons |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Explicit Server Function API | `serverFunction({ input: schema, policies: [requireUser], handler: async (...) => {} })` | High | High | High | High | Medium | Medium to High | Best readability at the function definition, metadata stays local, easy to lint and teach | Requires new API surface, still needs an underlying composition model |
| First-party factory with middleware | `createServerFunctionFactory().policies([requireUser]).input(schema).define(async (...) => {})` | Medium | High | High | High | Medium | Medium to High | Powerful composition model, good for reusable defaults and advanced users | Meaning is less local, safety can become hidden inside wrappers, weaker as the default mental model |
| Ecosystem factory | Same API as above, but outside Next.js core | High | High | Medium | High | Low to Medium | Low for Next.js | Fast to iterate, can validate demand before standardizing | Fragmented ecosystem, less authority, weaker defaults across apps |
| Extended directive string | `"use server - auth"` or similar | Medium | Low to Medium | Low to Medium | Low | Low | Medium | Very lightweight, minimal code churn, feels native | Stringly-typed, hard to scale, hard to compose, reinforces "magic strings" |
| Explicit import-based API | `import { serverFunction } from "next/server"` | High | Medium to High | High | High | Medium to High | High | Removes string magic, good for analysis, easy to teach | Larger semantic shift from current model, more migration complexity |
| Decorators / annotations | `@serverFunction({ policies: [requireUser] })` | High | Medium to High | Medium | Medium | Medium | High | Compact and readable when supported | Awkward JS story, TS/transforms complexity, decorator baggage |
| File or export convention | `*.server.ts` or reserved `export const serverFunctions` | Medium | Low to Medium | Medium | Medium | Low to Medium | Low to Medium | Easy discovery, simple conventions, build-time friendly | Convention-based magic, weak per-function policy expression |
| Auth-by-default policy | All Server Functions authenticated unless marked public | Medium | High for auth only | Medium | Medium | High | Medium | Strong default, eliminates a common omission | Too opinionated, public functions become awkward, hidden global rules |
| Capability-based context | Server Function declares required capabilities instead of booleans | High | High | High | High | High | High | Strong long-term model, more principled than flags | Heavy mental model, likely too big for an initial Next.js change |
| Compiler / build-time checks | Warnings or errors for unsafe patterns | Low to Medium | Medium | High | Medium | Low | Medium | First-party feedback without changing syntax much | Intent is hard to infer, false positives likely, not enough alone |
| ESLint rules | `next/safe-server-functions` | Low to Medium | Medium | High | Medium | Low | Low | Cheap to ship, CI-friendly, easy to iterate | Advisory only, bypassable, not a primary API |
| VS Code extension | Editor diagnostics and code actions | Low | Low | Medium | Low | Low | Low | Great UX, fast prototype, useful for demos | Editor-specific, weak in CI and weak for agentic workflows |
| LSP-based diagnostics | Language server diagnostics and fixes | Low to Medium | Low to Medium | High | Medium | Low | Medium | Cross-editor story, can power smart code actions | Depends on editor and client support, still advisory |
| MCP-based assistant tooling | Project-aware Server Function auditing for agents | Low | Low to Medium | Medium | High | Low | Medium | Strong AI story, useful for automated refactors and audits | Still ecosystem-dependent, not an enforcement mechanism |
| Runtime wrappers only | `withAuth(withRateLimit(serverFunction))` | Medium | High | Medium | Medium | Low to Medium | Low to Medium | Real runtime protection, easy to understand, can ship incrementally | Does not fully solve discoverability or static tooling on its own |
| Manifest / codegen approach | Server Function metadata compiled into a manifest | High | High | High | High | High | High | Very analyzable, strong contracts, powerful tooling potential | Heavyweight, more infrastructure, may feel unlike current Next.js |

## Summary By Direction

### Strongest short-term direction

The most promising path is a layered approach built around an explicit `serverFunction()` API, backed internally by a composition model:

```ts
export const updateProfile = serverFunction({
  input: updateProfileSchema,
  policies: [requireUser, rateLimitBySubject],
  handler: async (context, input) => {
    await db.user.update({
      where: { id: context.user.id },
      data: { bio: input.bio },
    });

    return { ok: true };
  },
});
```

Why this direction stands out:

- It makes the Server Function boundary explicit.
- It keeps the safety metadata local to the function instead of hiding it in a wrapper.
- It gives Next.js a place to attach real runtime guarantees.
- It scales better than directive strings once more policies exist.
- It produces structured metadata that lint rules, LSPs, and agents can understand.
- It can be introduced incrementally.

### Valuable supporting layers

Even if `serverFunction()` becomes the main API, tooling still matters:

- ESLint can catch obvious mistakes quickly and is the cheapest way to validate the model.
- LSP support is a better long-term editor story than a VS Code-only extension.
- MCP is useful as an AI-facing layer, but should not be the main enforcement strategy.

### Weakest primary direction

Directive extensions such as `"use server - auth"` are attractive because they are small, but they likely age poorly:

- They are hard to compose.
- They remain stringly-typed.
- They blur whether policy is code, metadata, or compiler magic.
- They do not create a strong abstraction for policies or typed context.

## Recommendation

The best initial recommendation is:

1. Keep React's `'use server'` primitive for transport and compatibility.
2. Add an explicit `serverFunction()` API as the primary Next.js surface.
3. Back that API with typed runtime policies and an `input` contract that can infer handler types.
4. Add an ESLint rule set that understands the function metadata.
5. Treat LSP and MCP as optional follow-on layers, not as the foundation.

This is a better fit than betting on new directive strings or editor-only solutions.

## Recommended API Shape

The public API should be explicit:

```ts
'use server'

export const updateProfile = serverFunction({
  input: updateProfileSchema,
  policies: [requireUser, rateLimitBySubject],
  handler: async (context, input) => {
    await db.user.update({
      where: { id: context.user.id },
      data: { bio: input.bio },
    });

    return { ok: true };
  },
});
```

Why this is better than a factory-first public API:

- The Server Function definition is self-describing where it is exported.
- Tooling does not need to chase factory composition to understand basic policy.
- It is easier to teach than "define a secure factory somewhere else and remember to use it."
- Advanced composition can still exist underneath or as a lower-level API later.

In other words:

- Default public API: `serverFunction(...)`
- Lower-level primitive: factory/composition
- React primitive: `'use server'`

That split keeps the model readable without fighting React's existing semantics.

## Why Not Just Tooling?

Tooling-only approaches are useful, but insufficient as the core answer.

- Editor and LSP diagnostics are advisory.
- VS Code extensions do not help every editor or CI workflow.
- AI agents may or may not have access to editor integrations.
- A runtime model is still needed for real guarantees.

Tooling is best when it reflects a clear API, not when it tries to invent one.

## Runtime Ownership

Next.js should not try to own all concrete guard implementations.

What Next.js should own:

- the `serverFunction()` API
- the execution pipeline
- typed context propagation
- policy contracts
- framework-level transport protections such as origin checks and body limits

What app code or the ecosystem should own:

- auth/session lookups
- role and permission checks
- rate limiting strategies
- schema library choice

This is why `auth: true` is not a good real API. It is too vague for actual applications. The framework should provide the hook point, not pretend auth is one boolean.

## Input Contract

Input validation should be part of the Server Function model, but Next.js should not take a hard dependency on Zod or ship a large adapter surface.

The best primary design is to accept:

```ts
input: updateProfileSchema
```

That approach is better because:

- it makes the schema the visible contract for the function
- it gives TypeScript a clean place to infer the `handler` input type
- it keeps the framework validator-agnostic
- it supports Zod, Valibot, ArkType, or custom validators without first-party adapters if they implement a shared schema contract

The strongest option here is to support Standard Schema-compatible validators as the preferred path. That gives Next.js one common contract without inventing its own schema DSL.

However, Standard Schema should not be the only path. There should also be an escape hatch for custom parsing:

```ts
parse: (raw) => myCustomParse(raw)
```

That keeps the API flexible and avoids making Standard Schema a hard requirement for every app.

## Why Not Keep It In The Ecosystem?

That is a valid path for experimentation, but there are tradeoffs:

- A framework problem often benefits from framework-level conventions.
- First-party ownership helps docs, consistency, and discoverability.
- The Next.js team can integrate more deeply with compiler checks and official tooling.

The downside is maintenance burden, which is why the first version should stay small and opinionated.

## Prototype Scope

This repo should likely start small:

1. Implement a lightweight explicit `serverFunction()` prototype.
2. Model validation as `input: schema` for the common case, with `parse(raw)` as the escape hatch.
3. Support two or three policies only:
   - require user
   - input validation
   - rate limiting
4. Show how typed context is passed into the handler.
5. Document how this model could later feed ESLint, LSP, or MCP integrations.

That is enough to demonstrate the idea without pretending to solve the entire Next.js API design space.

See [examples/README.md](/Users/marcoshernanz/dev/server-actions/examples/README.md) for a small, realistic example layout.

## Open Questions

- Should this live in Next.js core, a companion package, or start in the ecosystem?
- Should Server Functions expose only `input`, `parse`, and `policies`, or should there be a slightly richer options model?
- How much of the safety story belongs at runtime versus build time?
- Can existing `"use server"` functions interoperate cleanly with a `serverFunction()` model?
- What is the smallest design that still gives enough structure for tooling?

## Current Hypothesis

The strongest hypothesis to test is:

> Safe Server Functions should be modeled as explicit, typed function definitions with pluggable runtime policies and an `input` schema contract, and then surfaced to lint, LSP, and agent tooling through shared metadata.

If that hypothesis holds up, the next step is not another brainstorm. It is a minimal prototype that makes the tradeoffs concrete.
