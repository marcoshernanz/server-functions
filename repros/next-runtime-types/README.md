# Next.js Server Action runtime type repro

This repro tests whether a TypeScript annotation on a Server Action parameter is
available as a runtime validator.

Run it with:

```bash
npm install
npm run dev
```

Open `http://localhost:3100` and click **Call with injected string**. The server
action is declared as `unsafeFunc(limit: number)`, but the client calls it with:

```ts
"10&expand[]=payment_methods&admin=true" as unknown as number
```

Expected result:

- the server action reports `runtimeType: "string"`
- the server action builds a URL containing the injected query string
- the local mock API sees `limit=10`, `expand[]=payment_methods`, and
  `admin=true`

This does not contact Stripe. The `/api/stripe/...` route is a local mock that
returns what it parsed from the URL.

## Observed result

Tested with Next.js 16.2.7 and React 19.2.7.

The injected-string case rendered:

```json
{
  "declaredType": "number",
  "runtimeType": "string",
  "runtimeValue": "10&expand[]=payment_methods&admin=true",
  "mockStripeUrl": "http://localhost:3100/api/stripe/users/user_123?limit=10&expand[]=payment_methods&admin=true",
  "parsedLimit": "10",
  "injectedQuery": "{\"admin\":\"true\",\"expand\":[\"payment_methods\"]}"
}
```

The Next dev server also logged:

```txt
GET /api/stripe/users/user_123?limit=10&expand[]=payment_methods&admin=true 200
POST /?fresh=1 200
  └─ ƒ unsafeFunc("10&expand[]=payment_methods&admin=true") app/actions.ts
```

So the TypeScript `number` annotation was not a runtime validator. The cast in
the client component is only a convenient way to represent what a malicious or
hand-written client can do once TypeScript has been compiled away.
