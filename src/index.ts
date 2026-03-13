import type { StandardSchemaV1 } from "@standard-schema/spec";

type MaybePromise<T> = T | Promise<T>;
type ContextFragment = Record<string, unknown>;
type ReservedContextKey = keyof BaseContext;

declare const policyBrand: unique symbol;

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

export type ServerFunction<TSchema extends StandardSchemaV1, TResult> = (
  input: StandardSchemaV1.InferInput<TSchema>,
) => Promise<TResult>;

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

export function definePolicy<
  TRequiredContext extends object = {},
  TOutput extends ContextFragment = {},
>(
  handler: (context: BaseContext & TRequiredContext) => MaybePromise<TOutput>,
): Policy<TRequiredContext, TOutput> {
  return { handler } as Policy<TRequiredContext, TOutput>;
}

export function serverFunction<
  const TSchema extends StandardSchemaV1,
  const TPolicies extends readonly AnyPolicy[],
  TResult,
>(
  config: ServerFunctionConfig<TSchema, TPolicies, TResult> &
    AssertNoContextCollisions<TPolicies>,
): ServerFunction<TSchema, Awaited<TResult>> {
  void config;

  return (async (_input: StandardSchemaV1.InferInput<TSchema>) => {
    throw new Error("Runtime execution is not implemented in this prototype.");
  }) as ServerFunction<TSchema, Awaited<TResult>>;
}
