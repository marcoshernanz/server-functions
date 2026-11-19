"use server";

import { headers } from "next/headers";

async function auth() {
  return "user_123";
}

export async function unsafeFunc(limit: number) {
  const userId = await auth();
  const requestHeaders = await headers();
  const host = requestHeaders.get("host") ?? "localhost:3100";
  const protocol = requestHeaders.get("x-forwarded-proto") ?? "http";
  const mockStripeUrl = `${protocol}://${host}/api/stripe/users/${userId}?limit=${limit}`;
  const response = await fetch(mockStripeUrl, { cache: "no-store" });

  return {
    declaredType: "number",
    runtimeType: typeof limit,
    runtimeValue: limit,
    mockStripeUrl,
    mockStripeSaw: await response.json(),
  };
}
