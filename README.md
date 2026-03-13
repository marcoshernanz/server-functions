# Safe Server Actions Exploration

This repo explores how Next.js could make Server Actions safer without making them significantly harder to use.

The problem is not just security. It is also readability and tooling:

- Server Actions can look too similar to ordinary functions.
- Important guardrails such as auth, authorization, input validation, origin checks, and rate limiting are easy to forget.
- The safety model is not very visible to editors, static analysis, or AI agents.

The goal of this document is to compare the main approaches, identify the tradeoffs, and recommend an initial direction to prototype.

## Safety Goals

Any proposal should try to improve at least some of the following:

- Explicitness: make it obvious that an action is not a normal function.
- Enforceability: make common guardrails hard to forget.
- Extensibility: support more than a single boolean like auth or no-auth.
- Toolability: expose enough structure for lint rules, editors, LSPs, and agent tooling.
- Incremental adoption: let existing apps adopt it without a full rewrite.
- Framework fit: keep the model understandable within Next.js.

## Evaluation Axes

The options below are compared across these axes:

- Explicitness: how clearly the code signals "this is a server action".
- Safety guarantees: how well the approach can enforce auth, validation, or similar checks.
- Tooling fit: how well static analysis, editor tooling, and build-time diagnostics can understand the model.
- AI fit: how usable the approach is for agentic workflows, codegen, and automated refactors.
- Migration cost: how disruptive the approach would be for existing apps.
- Framework cost: how much API, compiler, and maintenance burden it adds to Next.js.

## Options

| Option | Example shape | Explicitness | Safety guarantees | Tooling fit | AI fit | Migration cost | Framework cost | Pros | Cons |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Explicit action API | `action({ input: fromZod(schema), use: [requireUser()] }).run(async ...)` | High | High | High | High | Medium | Medium to High | Best readability at the action definition, metadata stays local, easy to lint and teach | Requires new API surface, still needs an underlying composition model |
| First-party action factory with middleware | `createActionFactory().use(requireUser()).input(fromZod(schema)).action(async ...)` | Medium | High | High | High | Medium | Medium to High | Powerful composition model, good for reusable defaults and advanced users | Meaning is less local, safety can become hidden inside wrappers, weaker as the default mental model |
| Ecosystem action factory | Same API as above, but outside Next.js core | High | High | Medium | High | Low to Medium | Low for Next.js | Fast to iterate, can validate demand before standardizing | Fragmented ecosystem, less authority, weaker defaults across apps |
| Extended directive string | `"use server - auth"` or similar | Medium | Low to Medium | Low to Medium | Low | Low | Medium | Very lightweight, minimal code churn, feels native | Stringly-typed, hard to scale, hard to compose, reinforces "magic strings" |
| Explicit import-based API | `import { serverAction } from "next/server"` | High | Medium to High | High | High | Medium to High | High | Removes string magic, good for analysis, easy to teach | Larger semantic shift from current model, more migration complexity |
| Decorators / annotations | `@serverAction({ auth: true })` | High | Medium to High | Medium | Medium | Medium | High | Compact and readable when supported | Awkward JS story, TS/transforms complexity, decorator baggage |
| File or export convention | `*.action.ts` or reserved `export const actions` | Medium | Low to Medium | Medium | Medium | Low to Medium | Low to Medium | Easy discovery, simple conventions, build-time friendly | Convention-based magic, weak per-action policy expression |
| Auth-by-default policy | All actions authenticated unless marked public | Medium | High for auth only | Medium | Medium | High | Medium | Strong default, eliminates a common omission | Too opinionated, public actions become awkward, hidden global rules |
| Capability-based context | Action declares required capabilities instead of booleans | High | High | High | High | High | High | Strong long-term model, more principled than flags | Heavy mental model, likely too big for an initial Next.js change |
| Compiler / build-time checks | Warnings or errors for unsafe patterns | Low to Medium | Medium | High | Medium | Low | Medium | First-party feedback without changing syntax much | Intent is hard to infer, false positives likely, not enough alone |
| ESLint rules | `next/safe-server-actions` | Low to Medium | Medium | High | Medium | Low | Low | Cheap to ship, CI-friendly, easy to iterate | Advisory only, bypassable, not a primary API |
| VS Code extension | Editor diagnostics and code actions | Low | Low | Medium | Low | Low | Low | Great UX, fast prototype, useful for demos | Editor-specific, weak in CI and weak for agentic workflows |
| LSP-based diagnostics | Language server diagnostics and fixes | Low to Medium | Low to Medium | High | Medium | Low | Medium | Cross-editor story, can power smart code actions | Depends on editor and client support, still advisory |
| MCP-based assistant tooling | Project-aware action auditing for agents | Low | Low to Medium | Medium | High | Low | Medium | Strong AI story, useful for automated refactors and audits | Still ecosystem-dependent, not an enforcement mechanism |
| Runtime wrappers only | `withAuth(withRateLimit(action))` | Medium | High | Medium | Medium | Low to Medium | Low to Medium | Real runtime protection, easy to understand, can ship incrementally | Does not fully solve discoverability or static tooling on its own |
| Manifest / codegen approach | Action metadata compiled into a manifest | High | High | High | High | High | High | Very analyzable, strong contracts, powerful tooling potential | Heavyweight, more infrastructure, may feel unlike current Next.js |

## Summary By Direction

### Strongest short-term direction

The most promising path is a layered approach built around an explicit `action()` API, backed internally by a composition model:

```ts
export const updateProfile = action({
  input: fromZod(z.object({ bio: z.string().min(10).max(160) })),
  use: [requireUser(), rateLimitBySubject()],
}).run(async ({ input }, { ctx }) => {
  await db.user.update({
    where: { id: ctx.user.id },
    data: { bio: input.bio },
  });
});
```

Why this direction stands out:

- It makes the action boundary explicit.
- It keeps the safety metadata local to the action instead of hiding it in a wrapper.
- It gives Next.js a place to attach real runtime guarantees.
- It scales better than directive strings once more policies exist.
- It produces structured metadata that lint rules, LSPs, and agents can understand.
- It can be introduced incrementally.

### Valuable supporting layers

Even if `action()` becomes the main API, tooling still matters:

- ESLint can catch obvious mistakes quickly and is the cheapest way to validate the model.
- LSP support is a better long-term editor story than a VS Code-only extension.
- MCP is useful as an AI-facing layer, but should not be the main enforcement strategy.

### Weakest primary direction

Directive extensions such as `"use server - auth"` are attractive because they are small, but they likely age poorly:

- They are hard to compose.
- They remain stringly-typed.
- They blur whether policy is code, metadata, or compiler magic.
- They do not create a strong abstraction for middleware or typed context.

## Recommendation

The best initial recommendation is:

1. Keep React's `'use server'` primitive for transport and compatibility.
2. Add an explicit `action()` API as the primary Next.js surface.
3. Back that API with typed runtime policies and validator adapters.
4. Add an ESLint rule set that understands the action metadata.
5. Treat LSP and MCP as optional follow-on layers, not as the foundation.

This is a better fit than betting on new directive strings or editor-only solutions.

## Recommended API Shape

The public API should be explicit:

```ts
'use server'

export const updateProfile = action({
  input: fromZod(updateProfileSchema),
  use: [requireUser(), rateLimitBySubject()],
}).run(async ({ input }, { ctx }) => {
  await db.user.update({
    where: { id: ctx.user.id },
    data: { bio: input.bio },
  });
});
```

Why this is better than a factory-first public API:

- The action definition is self-describing where it is exported.
- Tooling does not need to chase factory composition to understand basic policy.
- It is easier to teach than "define a secure factory somewhere else and remember to use it."
- Advanced composition can still exist underneath or as a lower-level API later.

In other words:

- Default public API: `action(...)`
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

- the `action()` API
- the execution pipeline
- typed context propagation
- validator and policy contracts
- framework-level transport protections such as origin checks and body limits

What app code or the ecosystem should own:

- auth/session lookups
- role and permission checks
- rate limiting strategies
- schema library choice

This is why `auth: true` is not a good real API. It is too vague for actual applications. The framework should provide the hook point, not pretend auth is one boolean.

## Validation Model

Input validation should be part of the action model, but Next.js should not take a hard dependency on Zod.

Instead, Next.js should support a small validator contract or adapter layer:

```ts
input: fromZod(updateProfileSchema)
```

That approach is better because:

- it keeps the framework validator-agnostic
- it supports Zod without making Zod a framework dependency
- it leaves room for Valibot, ArkType, or custom validators
- it gives tooling a stable abstraction regardless of library choice

## Why Not Keep It In The Ecosystem?

That is a valid path for experimentation, but there are tradeoffs:

- A framework problem often benefits from framework-level conventions.
- First-party ownership helps docs, consistency, and discoverability.
- The Next.js team can integrate more deeply with compiler checks and official tooling.

The downside is maintenance burden, which is why the first version should stay small and opinionated.

## Prototype Scope

This repo should likely start small:

1. Implement a lightweight explicit `action()` prototype.
2. Model validators as adapters instead of tying the API to one library.
3. Support two or three policies only:
   - require user
   - input validation
   - rate limiting
4. Show how typed context is passed into the handler.
5. Document how this model could later feed ESLint, LSP, or MCP integrations.

That is enough to demonstrate the idea without pretending to solve the entire Next.js API design space.

See [explicitActionApi.ts](/Users/marcoshernanz/dev/server-actions/explicitActionApi.ts) for an end-to-end sketch of the proposed contracts and usage.

## Open Questions

- Should this live in Next.js core, a companion package, or start in the ecosystem?
- Should actions declare booleans like `auth: true`, or more expressive policy objects?
- How much of the safety story belongs at runtime versus build time?
- Can existing `"use server"` actions interoperate cleanly with a factory-based model?
- What is the smallest design that still gives enough structure for tooling?

## Current Hypothesis

The strongest hypothesis to test is:

> Safe Server Actions should be modeled as explicit, typed action definitions with pluggable policies and validator adapters, and then surfaced to lint, LSP, and agent tooling through shared metadata.

If that hypothesis holds up, the next step is not another brainstorm. It is a minimal prototype that makes the tradeoffs concrete.
