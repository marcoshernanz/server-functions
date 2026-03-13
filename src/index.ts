import type { StandardSchemaV1 } from "@standard-schema/spec";

type MaybePromise<T> = T | Promise<T>;
type ContextFragment = Record<string, unknown>;
type ReservedContextKey = keyof BaseContext;

declare const policyBrand: unique symbol;
const serverFunctionMeta = Symbol("serverFunctionMeta");

export type HeaderBag = {
  get(name: string): string | null;
};

export type BaseContext = {
  headers: HeaderBag;
  ip?: string | undefined;
  requestId: string;
};

export type Policy<
  TRequiredContext extends object = {},
  TOutput extends ContextFragment = {},
> = {
  readonly [policyBrand]: {
    readonly requiredContext: TRequiredContext;
    readonly output: TOutput;
  };
  readonly handler: (
    context: BaseContext & TRequiredContext,
  ) => MaybePromise<TOutput>;
};

type AnyPolicy = Policy<any, any>;
type PolicyOutput<TPolicy extends AnyPolicy> =
  TPolicy[typeof policyBrand]["output"];

type DuplicatePolicyKeys<
  TPolicies extends readonly AnyPolicy[],
  TSeen extends PropertyKey = ReservedContextKey,
  TDuplicate extends PropertyKey = never,
> = TPolicies extends readonly [
  infer THead extends AnyPolicy,
  ...infer TTail extends readonly AnyPolicy[],
]
  ? DuplicatePolicyKeys<
      TTail,
      TSeen | keyof PolicyOutput<THead>,
      TDuplicate | Extract<keyof PolicyOutput<THead>, TSeen>
    >
  : TDuplicate;

type AssertNoContextCollisions<TPolicies extends readonly AnyPolicy[]> =
  DuplicatePolicyKeys<TPolicies> extends never
    ? {}
    : {
        readonly __context_key_collision__: DuplicatePolicyKeys<TPolicies>;
      };

type MergePolicyOutputs<
  TPolicies extends readonly AnyPolicy[],
  TAccumulated extends object = {},
> = TPolicies extends readonly [
  infer THead extends AnyPolicy,
  ...infer TTail extends readonly AnyPolicy[],
]
  ? MergePolicyOutputs<TTail, TAccumulated & PolicyOutput<THead>>
  : TAccumulated;

type ServerFunctionConfig<
  TSchema extends StandardSchemaV1,
  TPolicies extends readonly AnyPolicy[],
  TResult,
> = {
  input: TSchema;
  policies: TPolicies;
  handler: (
    context: BaseContext & MergePolicyOutputs<TPolicies>,
    input: StandardSchemaV1.InferOutput<TSchema>,
  ) => MaybePromise<TResult>;
};

type ServerFunctionMetadata<
  TSchema extends StandardSchemaV1,
  TPolicies extends readonly AnyPolicy[],
  TResult,
> = ServerFunctionConfig<TSchema, TPolicies, TResult>;

export type ServerFunction<TSchema extends StandardSchemaV1, TResult> = ((
  input: StandardSchemaV1.InferInput<TSchema>,
) => Promise<TResult>) & {
  readonly [serverFunctionMeta]: ServerFunctionMetadata<
    TSchema,
    readonly AnyPolicy[],
    TResult
  >;
};

type AnyServerFunction = ((input: any) => Promise<any>) & {
  readonly [serverFunctionMeta]: unknown;
};

type ServerFunctionMetadataOf<TServerFunction extends AnyServerFunction> =
  TServerFunction[typeof serverFunctionMeta] extends ServerFunctionMetadata<
    infer TSchema extends StandardSchemaV1,
    infer TPolicies extends readonly AnyPolicy[],
    infer TResult
  >
    ? ServerFunctionMetadata<TSchema, TPolicies, TResult>
    : never;

export function definePolicy<
  TRequiredContext extends object = {},
  TOutput extends ContextFragment = {},
>(
  handler: (context: BaseContext & TRequiredContext) => MaybePromise<TOutput>,
): Policy<TRequiredContext, TOutput> {
  return { handler } as Policy<TRequiredContext, TOutput>;
}

type ExecuteServerFunctionOptions<TServerFunction extends AnyServerFunction> = {
  context: BaseContext;
  input: Parameters<TServerFunction>[0];
};

function isContextFragment(value: unknown): value is ContextFragment {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function mergeContext(
  context: BaseContext & ContextFragment,
  fragment: ContextFragment,
): BaseContext & ContextFragment {
  for (const key of Object.keys(fragment)) {
    if (key in context) {
      throw new Error(`Context key collision at runtime: ${key}`);
    }
  }

  return { ...context, ...fragment };
}

let requestCounter = 0;

function createPrototypeBaseContext(): BaseContext {
  requestCounter += 1;

  return {
    headers: {
      get() {
        return null;
      },
    },
    ip: "127.0.0.1",
    requestId: `req_${requestCounter}`,
  };
}

async function runServerFunction<TServerFunction extends AnyServerFunction>(
  serverFunction: TServerFunction,
  options: ExecuteServerFunctionOptions<TServerFunction>,
): Promise<Awaited<ReturnType<TServerFunction>>> {
  const metadata = serverFunction[
    serverFunctionMeta
  ] as ServerFunctionMetadataOf<TServerFunction>;
  const validationResult = await metadata.input["~standard"].validate(
    options.input,
  );

  if ("issues" in validationResult && validationResult.issues) {
    const error = new Error("Invalid input") as Error & {
      issues?: ReadonlyArray<StandardSchemaV1.Issue>;
    };
    error.issues = validationResult.issues;
    throw error;
  }

  let context = { ...options.context } as BaseContext & ContextFragment;

  for (const policy of metadata.policies) {
    const fragment = await (policy as AnyPolicy).handler(context);

    if (!isContextFragment(fragment)) {
      throw new Error("Policy output must be an object");
    }

    context = mergeContext(context, fragment);
  }

  return (await metadata.handler(
    context as never,
    validationResult.value as never,
  )) as Awaited<ReturnType<TServerFunction>>;
}

export function serverFunction<
  const TSchema extends StandardSchemaV1,
  const TPolicies extends readonly AnyPolicy[],
  TResult,
>(
  config: ServerFunctionConfig<TSchema, TPolicies, TResult> &
    AssertNoContextCollisions<TPolicies>,
): ServerFunction<TSchema, Awaited<TResult>> {
  const fn = (async (input: StandardSchemaV1.InferInput<TSchema>) => {
    return runServerFunction(fn as AnyServerFunction, {
      context: createPrototypeBaseContext(),
      input,
    });
  }) as unknown as ServerFunction<TSchema, Awaited<TResult>>;

  Object.defineProperty(fn, serverFunctionMeta, {
    value: config,
    enumerable: false,
    writable: false,
  });

  return fn;
}
