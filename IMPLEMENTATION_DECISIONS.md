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
- `input: schema` as a required option
- `policies: [...]` as the policy composition mechanism
- `handler: async (context, input) => {}` as the handler signature
- strong type inference from `input` and `policies`

V1 will not implement yet:

- `parse(raw)` or any custom parser escape hatch
- no-input Server Functions
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

### Input naming

We will use `input`, not `args`.

Reasoning:

- there is always one validated payload object
- this is not a positional-arguments API
- `input` matches the real security model better than `args`
- it reads more naturally in both the config object and the handler

### Policies naming

We will use `policies`, not `use`.

Reasoning:

- `use` is too generic
- `policies` makes the intent obvious at the definition site
- explicit names matter in an API whose goal is safety

### Context naming

In prose, we will call the first handler parameter `context`.

In user code, developers can still name that local variable `ctx` if they want. That is not API surface.

## Public API Shape

The v1 public API is:

```ts
export const updateProfile = serverFunction({
  input: updateProfileSchema,
  policies: [requireUser, rateLimitByIp],
  handler: async (context, input) => {
    await db.user.update({
      where: { id: context.user.id },
      data: { bio: input.bio },
    });

    return { ok: true };
  },
});
```

Core decisions:

- `serverFunction(...)` takes one config object
- `handler` is inline inside that object
- `handler` receives `(context, input)`
- `policies` is an array
- `context` is an object
- `input` is required in v1

## Why `handler(context, input)` Instead Of Other Shapes

We are choosing:

```ts
handler: async (context, input) => {}
```

We are not choosing:

```ts
handler: async (input, context) => {}
handler: async ([user, rateLimit], input) => {}
handler: async ({ user, rateLimit }, input) => {}
```

Reasoning:

- This matches the strongest part of the Convex shape: execution context first, validated input second.
- `context` is conceptually environment and capabilities, not user input.
- `input` should always be one validated object, not positional arguments.
- Tuple-based policy outputs are too brittle.
- Object destructuring can still happen inside the handler when needed.

## Why `policies` Is An Array

We are choosing:

```ts
policies: [requireUser, rateLimitByIp]
```

We are not choosing:

```ts
policies: { user: requireUser, rateLimit: rateLimitByIp }
```

Reasoning:

- `policies` represents ordered composition.
- Policies are pipeline steps, and arrays model pipelines better than objects.
- Some policies exist only to enforce behavior and should not need a name in user code.
- The handler should consume a merged `context`, not a positional or manually mapped policy output object.

## Why `context` Is An Object

Policies can contribute named fields to the handler context.

Examples:

- `requireUser` contributes `{ user }`
- `requireOrg` contributes `{ org }`
- `rateLimitByIp` contributes nothing

The final handler sees:

```ts
context: BaseContext & { user: User } & { org: Org }
```

Reasoning:

- Named fields are much easier to read than tuples.
- Policies that do not expose data are naturally supported.
- This scales better than positional outputs as more policies are added.

## Context Key Collisions

V1 will disallow context key collisions entirely.

That means:

- two policies cannot return the same top-level key
- a policy cannot return a key that collides with framework-owned context fields

Examples that should be rejected:

```ts
const requireUser = definePolicy(async () => {
  return { user: session.user };
});

const impersonateUser = definePolicy(async () => {
  return { user: targetUser };
});

serverFunction({
  input: schema,
  policies: [requireUser, impersonateUser],
  handler: async (context, input) => {
    context.user;
  },
});
```

```ts
const badPolicy = definePolicy(async () => {
  return { headers: "not allowed" };
});
```

Reasoning:

- silent overwrites are too dangerous in a safety-focused API
- `context.user` should never change meaning based on policy order
- disallowing collisions makes the type model much cleaner
- it forces policy authors to choose explicit, stable names

Expected enforcement:

- compile-time error when collisions are visible in the type system
- runtime error as a backstop

How users should resolve collisions:

- rename one key, for example `viewer` vs `impersonatedUser`
- move derived data to another field, for example `permissions`
- combine related data into one policy if it really represents one concept

## `input` Contract

V1 will require:

```ts
input: schema
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
- no-input Server Functions without an explicit schema placeholder

Those can be added later if needed.

## Standard Schema Decision

We will support Standard Schema as the only `input` contract in v1.

Reasoning:

- it gives one clear type-level contract
- it keeps implementation small
- it keeps the prototype focused
- it works with libraries like Zod, Valibot, and ArkType if they implement the protocol

This is a deliberate simplification for the prototype, not necessarily the final product shape.

## Type Inference Rules

### `input` inference

`handler` should infer its `input` parameter from `input: schema`.

Conceptually:

```ts
type InferInput<TSchema> = StandardSchemaV1.InferOutput<TSchema>;
```

So this:

```ts
const schema = z.object({
  bio: z.string(),
});

serverFunction({
  input: schema,
  policies: [],
  handler: async (_context, input) => {
    input.bio;
  },
});
```

should infer:

```ts
input: { bio: string }
```

### `context` inference

`handler` should infer its `context` parameter from the intersection of all policy outputs.

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
  input: schema,
  policies: [requireUser, requireOrg("acme")] as const,
  handler: async (context, input) => {
    context.user;
    context.org;
    input.bio;
  },
});
```

should infer:

```ts
context: BaseContext & { user: User } & { org: Org }
```

### `policies` must preserve tuple inference

We want `policies` to preserve literal tuple inference.

That means the generic should likely use:

```ts
const TPolicies extends readonly Policy<any>[]
```

and examples should use:

```ts
policies: [requireUser, requireOrg("acme")] as const
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
policies: [requireUser]
```

### Parameterized policies

Example:

```ts
export const requireRole = (role: string) =>
  definePolicy(async (context) => {
    if (!context.user.roles.includes(role)) {
      throw new Error("Forbidden");
    }

    return {};
  });
```

Usage:

```ts
policies: [requireUser, requireRole("admin")]
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
  input: updateProfileSchema,
  policies: [requireUser],
  handler: async (context, input) => {
    return { ok: true as const, userId: context.user.id, bio: input.bio };
  },
});
```

The resulting Server Function type should preserve that resolved return type.

## Error Model

We are not designing a full error model in v1.

For the prototype:

- policies can throw
- handlers can throw
- no special framework error classes are required yet

This is enough for the type prototype.

## Serialization

We are not enforcing React or Next serialization constraints in v1 types.

Reasoning:

- this adds noise before the core API is proven
- it is not necessary to validate the shape of the API
- serialization constraints can be layered in later

## Deferred Decisions

These are intentionally postponed:

- `parse(raw)` escape hatch
- support for no-input Server Functions
- support for optional `policies`
- whether `input` should allow async parsing explicitly
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
  input: updateProfileSchema,
  policies: [requireUser, rateLimitByIp],
  handler: async (context, input) => {
    await db.user.update({
      where: { id: context.user.id },
      data: { bio: input.bio },
    });

    return { ok: true };
  },
});
```

## Implementation Checklist

When implementation starts, the first pass should produce:

1. the public `serverFunction` type signature
2. the public `definePolicy` type signature
3. Standard Schema-based `input` inference
4. merged `context` inference from `policies`
5. a type-test file proving the happy path

That is enough for v1.
