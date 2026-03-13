"use server";

import { z } from "zod";

import { serverFunction } from "../src/index.js";
import { db, supportInbox } from "./inventedApp.js";
import {
  loadOrganization,
  rateLimitByIp,
  requireOrganizationOwner,
  requireUser,
} from "./policies.js";

export const updateProfile = serverFunction({
  input: z.object({ bio: z.string().min(10).max(160) }),
  policies: [requireUser, rateLimitByIp],
  handler: async (context, input) => {
    await db.user.update({
      where: { id: context.user.id },
      data: { bio: input.bio },
    });

    return { ok: true as const };
  },
});

export const submitSupportTicket = serverFunction({
  input: z.object({ email: z.email(), message: z.string().min(20) }),
  policies: [rateLimitByIp],
  handler: async (_context, input) => {
    await supportInbox.createTicket({
      email: input.email,
      message: input.message,
    });

    return { ok: true as const };
  },
});

export const createOrganizationInvite = serverFunction({
  input: z.object({ email: z.email() }),
  policies: [requireUser, loadOrganization("acme"), requireOrganizationOwner],
  handler: async (context, input) => {
    await db.organizationInvite.create({
      organizationId: context.organization.id,
      email: input.email,
      invitedByUserId: context.user.id,
    });

    return {
      ok: true as const,
      organizationSlug: context.organization.slug,
    };
  },
});
