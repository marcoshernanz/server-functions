# Server Function API Implementation Decisions

This document freezes the initial implementation decisions for the typed API prototype.

The goal of v1 is narrow:

- implement a clean public API
- make the type inference excellent
- avoid committing to runtime internals yet
- avoid handling every escape hatch yet

This is not the full design space. It is the subset we want to implement first.

## Scope

V1 will implement:

- `serverFunction(...)`
- `definePolicy(...)`
- `args: schema` as a required option
- `use: [...]` as the policy composition mechanism
- `handler: async (ctx, args) => {}` as the handler signature
- strong type inference from `args` and `use`

V1 will not implement yet:

- `parse(raw)` or any custom parser escape hatch
- runtime execution details
- framework transport integration
- lint rules
- LSP or MCP integration
- policy dependency validation
- complex policy ordering constraints

## Naming Decisions

### Server Function naming

We will use `serverFunction`, not `serverAction`.

Reasoning:

- React now uses "Server Functions" in the official docs.
- The term is more precise than "action".
- It avoids overloading "action" with form actions, mutations, and older terminology.

### Policy naming

We will use `definePolicy`, not `policy`.

Reasoning:

- `definePolicy(...)` reads like a declaration.
- It makes fixed policies and parameterized policies easier to distinguish.
- It is clearer than `policy(...)` when reading exported code.

Examples:

```ts
export const requireUser = definePolicy(async () => {
  const session = await getSession();

  if (!session?.user) {
    throw new Error("Unauthorized");
  }

  return { user: session.user };
});

export const requireRole = (role: string) =>
  definePolicy(async (ctx) => {
    if (!ctx.user.roles.includes(role)) {
      throw new Error("Forbidden");
    }

    return {};
  });
```

Usage:

```ts
use: [requireUser, requireRole("admin")]
```

## Public API Shape

The v1 public API is:

```ts
export const updateProfile = serverFunction({
  args: updateProfileSchema,
  use: [requireUser, rateLimitByIp],
  handler: async (ctx, args) => {
    await db.user.update({
      where: { id: ctx.user.id },
      data: { bio: args.bio },
    });

    return { ok: true };
  },
});
```

Core decisions:

- `serverFunction(...)` takes one config object
- `handler` is inline inside that object
- `handler` receives `(ctx, args)`
- `use` is an array
- `ctx` is an object
- `args` is required in v1

## Why `handler(ctx, args)` Instead Of Other Shapes

We are choosing:

```ts
handler: async (ctx, args) => {}
```

We are not choosing:

```ts
handler: async (args, ctx) => {}
handler: async ([user, rateLimit], args) => {}
handler: async ({ user, rateLimit }, args) => {}
```

Reasoning:

- This matches the strongest part of the Convex shape: context first, parsed args second.
- `ctx` is conceptually execution context, not user input.
- `args` should always be one validated object, not positional arguments.
- Tuple-based policy outputs are too brittle.
- Object destructuring can still happen inside the handler when needed.

## Why `use` Is An Array

We are choosing:

```ts
use: [requireUser, rateLimitByIp]
```

We are not choosing:

```ts
use: { user: requireUser, rateLimit: rateLimitByIp }
```

Reasoning:

- `use` represents ordered composition.
- Policies are pipeline steps, and arrays model pipelines better than objects.
- Some policies exist only to enforce behavior and should not need a name in user code.
- The handler should consume a merged `ctx`, not a positional or manually mapped policy output object.

## Why `ctx` Is An Object

Policies can contribute named fields to the handler context.

Examples:

- `requireUser` contributes `{ user }`
- `requireOrg` contributes `{ org }`
- `rateLimitByIp` contributes nothing

The final handler sees:

```ts
ctx: BaseContext & { user: User } & { org: Org }
```

Reasoning:

- Named fields are much easier to read than tuples.
- Policies that do not expose data are naturally supported.
- This scales better than positional outputs as more policies are added.

## `args` Contract

V1 will require:

```ts
args: schema
```

Where `schema` must satisfy the Standard Schema contract.

Reasoning:

- this gives us runtime parsing plus type inference
- it avoids inventing a Next-specific validation DSL
- it avoids maintaining library-specific adapters in v1
- it keeps the public API small

V1 will not support:

- `parse(raw)` fallback
- `validate(raw)` callback
- no-args server functions without an explicit schema placeholder

Those can be added later if needed.

## Standard Schema Decision

We will support Standard Schema as the only `args` contract in v1.

Reasoning:

- it gives one clear type-level contract
- it keeps implementation small
- it keeps the prototype focused
- it works with libraries like Zod, Valibot, and ArkType if they implement the protocol

This is a deliberate simplification for the prototype, not necessarily the final product shape.

## Type Inference Rules

### `args` inference

`handler` should infer its `args` parameter from `args: schema`.

Conceptually:

```ts
type InferArgs<TSchema> = StandardSchemaV1.InferOutput<TSchema>;
```

So this:

```ts
const schema = z.object({
  bio: z.string(),
});

serverFunction({
  args: schema,
  use: [],
  handler: async (_ctx, args) => {
    args.bio;
  },
});
```

should infer:

```ts
args: { bio: string }
```

### `ctx` inference

`handler` should infer its `ctx` parameter from the intersection of all policy outputs.

Conceptually:

```ts
type InferPolicyOutput<TPolicy> =
  TPolicy extends Policy<infer TOutput> ? TOutput : never;

type MergePolicyOutputs<TPolicies extends readonly Policy<any>[]> =
  UnionToIntersection<InferPolicyOutput<TPolicies[number]>>;
```

So this:

```ts
serverFunction({
  args: schema,
  use: [requireUser, requireOrg("acme")] as const,
  handler: async (ctx, args) => {
    ctx.user;
    ctx.org;
  },
});
```

should infer:

```ts
ctx: BaseContext & { user: User } & { org: Org }
```

### `use` must preserve tuple inference

We want `use` to preserve literal tuple inference.

That means the generic should likely use:

```ts
const TPolicies extends readonly Policy<any>[]
```

and examples should use:

```ts
use: [requireUser, requireOrg("acme")] as const
```

if needed.

Part of the implementation work will be making this as ergonomic as possible.

## Policy Model

The policy abstraction should support two kinds of policies:

### Fixed policies

Example:

```ts
export const requireUser = definePolicy(async () => {
  const session = await getSession();

  if (!session?.user) {
    throw new Error("Unauthorized");
  }

  return { user: session.user };
});
```

These are values, not factories.

Usage:

```ts
use: [requireUser]
```

### Parameterized policies

Example:

```ts
export const requireRole = (role: string) =>
  definePolicy(async (ctx) => {
    if (!ctx.user.roles.includes(role)) {
      throw new Error("Forbidden");
    }

    return {};
  });
```

Usage:

```ts
use: [requireUser, requireRole("admin")]
```

## Base Context Decision

There will be a framework-owned base context type available to all handlers and policies.

Initial fields should be minimal.

Proposed v1 fields:

- `headers`
- `ip`
- `requestId`

We should not add more unless needed for the type prototype.

Reasoning:

- the type surface should stay small
- app-specific data should come from policies
- we do not want to overfit to Next internals before runtime decisions exist

## Return Type Decision

The handler return type should be inferred directly from the handler.

Example:

```ts
export const updateProfile = serverFunction({
  args: updateProfileSchema,
  use: [requireUser],
  handler: async (ctx, args) => {
    return { ok: true as const, userId: ctx.user.id };
  },
});
```

The resulting server function type should preserve that resolved return type.

## Error Model

We are not designing a full error model in v1.

For the prototype:

- policies can throw
- handlers can throw
- no special framework error classes are required yet

This is enough for the type prototype.

## Serialization

We are not enforcing React/Next serialization constraints in v1 types.

Reasoning:

- this adds noise before the core API is proven
- it is not necessary to validate the shape of the API
- serialization constraints can be layered in later

## Deferred Decisions

These are intentionally postponed:

- `parse(raw)` escape hatch
- support for no-args server functions
- support for optional `use`
- whether `args` should allow async parsing explicitly
- policy dependency ordering checks
- collision behavior when two policies return the same key
- helper types exported publicly vs kept internal
- exact package dependency on `@standard-schema/spec`
- runtime callable function shape

## Reference Example

This is the target shape we are implementing first:

```ts
import { definePolicy, serverFunction } from "next/server";
import { z } from "zod";

export const requireUser = definePolicy(async () => {
  const session = await getSession();

  if (!session?.user) {
    throw new Error("Unauthorized");
  }

  return { user: session.user };
});

export const rateLimitByIp = definePolicy(async ({ ip, headers }) => {
  const subject = headers.get("x-forwarded-for") ?? ip ?? "unknown";
  const { success } = await ratelimit.limit(subject);

  if (!success) {
    throw new Error("Rate limit exceeded");
  }

  return {};
});

const updateProfileSchema = z.object({
  bio: z.string().min(10).max(160),
});

export const updateProfile = serverFunction({
  args: updateProfileSchema,
  use: [requireUser, rateLimitByIp],
  handler: async (ctx, args) => {
    await db.user.update({
      where: { id: ctx.user.id },
      data: { bio: args.bio },
    });

    return { ok: true };
  },
});
```

## Implementation Checklist

When implementation starts, the first pass should produce:

1. the public `serverFunction` type signature
2. the public `definePolicy` type signature
3. Standard Schema-based `args` inference
4. merged `ctx` inference from `use`
5. a type-test file proving the happy path

That is enough for v1.
