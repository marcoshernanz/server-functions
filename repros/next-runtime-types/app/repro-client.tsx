"use client";

import { useState, useTransition } from "react";
import { unsafeFunc } from "./actions";

type Result = Awaited<ReturnType<typeof unsafeFunc>>;

const injectedLimit = "10&expand[]=payment_methods&admin=true";

export function ReproClient() {
  const [result, setResult] = useState<Result | null>(null);
  const [isPending, startTransition] = useTransition();

  function callUnsafeFunc(value: unknown) {
    startTransition(async () => {
      const serverResult = await unsafeFunc(value as number);
      setResult(serverResult);
    });
  }

  return (
    <>
      <div className="controls">
        <button
          disabled={isPending}
          onClick={() => callUnsafeFunc(10)}
          type="button"
        >
          Call with number
        </button>
        <button
          disabled={isPending}
          onClick={() => callUnsafeFunc(injectedLimit)}
          type="button"
        >
          Call with injected string
        </button>
      </div>

      <section aria-live="polite" className="result">
        {result ? (
          <>
            <dl>
              <dt>Declared parameter type</dt>
              <dd data-testid="declared-type">{result.declaredType}</dd>
              <dt>Runtime value type</dt>
              <dd data-testid="runtime-type">{result.runtimeType}</dd>
              <dt>Runtime value</dt>
              <dd data-testid="runtime-value">{String(result.runtimeValue)}</dd>
              <dt>URL built by server action</dt>
              <dd data-testid="mock-stripe-url">{result.mockStripeUrl}</dd>
              <dt>Mock API parsed limit</dt>
              <dd data-testid="parsed-limit">{result.mockStripeSaw.limit}</dd>
              <dt>Injected query params</dt>
              <dd data-testid="injected-query">
                {JSON.stringify(result.mockStripeSaw.injectedQuery)}
              </dd>
            </dl>
            <pre>{JSON.stringify(result, null, 2)}</pre>
          </>
        ) : (
          <p>No server action call has run yet.</p>
        )}
      </section>
    </>
  );
}
