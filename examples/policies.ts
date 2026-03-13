import { definePolicy } from "../src/index.js";
import type { Organization, User } from "./inventedApp.js";
import { db, getSession, ratelimit } from "./inventedApp.js";

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

export const loadOrganization = (slug: string) =>
  definePolicy(async () => {
    const organization = await db.organization.findBySlug(slug);

    if (!organization) {
      throw new Error("Organization not found");
    }

    return { organization };
  });

export const requireOrganizationOwner = definePolicy(
  async (context: { organization: Organization; user: User }) => {
    if (context.organization.ownerUserId !== context.user.id) {
      throw new Error("Forbidden");
    }

    return {};
  },
);
