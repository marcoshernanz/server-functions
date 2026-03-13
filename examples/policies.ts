import { definePolicy } from "../src/index.js";
import { getSession, ratelimit } from "./app.js";

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
