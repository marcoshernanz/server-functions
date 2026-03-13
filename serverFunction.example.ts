"use server";

import { z } from "zod";

import { definePolicy, serverFunction } from "./src/index.js";

type User = {
  id: string;
  email: string;
};

type Session = {
  user: User;
};

type Organization = {
  id: string;
  slug: string;
};

declare function getSession(): Promise<Session | null>;

declare const ratelimit: {
  limit(subject: string): Promise<{ success: boolean }>;
};

declare const db: {
  user: {
    update(args: {
      where: { id: string };
      data: { bio: string };
    }): Promise<void>;
  };
  organization: {
    findBySlug(slug: string): Promise<Organization | null>;
  };
};

declare const supportInbox: {
  createTicket(args: { email: string; message: string }): Promise<void>;
};

// In a real app these policies would likely live in a shared file.
export const requireUser = definePolicy(async () => {
  const session = await getSession();

  if (!session?.user) {
    throw new Error("Unauthorized");
  }

  return { user: session.user };
});

export const loadOrganization = (slug: string) =>
  definePolicy(async () => {
    const organization = await db.organization.findBySlug(slug);

    if (!organization) {
      throw new Error("Organization not found");
    }

    return { organization };
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
  policies: [requireUser, loadOrganization("acme"), rateLimitByIp],
  handler: async (context, input) => {
    await db.user.update({
      where: { id: context.user.id },
      data: { bio: input.bio },
    });

    return {
      ok: true,
      organizationSlug: context.organization.slug,
    };
  },
});

const contactFormSchema = z.object({
  email: z.email(),
  message: z.string().min(20),
});

export const submitContactForm = serverFunction({
  input: contactFormSchema,
  policies: [rateLimitByIp],
  handler: async (_context, input) => {
    await supportInbox.createTicket({
      email: input.email,
      message: input.message,
    });

    return { ok: true };
  },
});
