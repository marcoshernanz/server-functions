"use server";

import { z } from "zod";

import { serverFunction } from "../src/index.js";
import { db, supportInbox } from "./app.js";
import { rateLimitByIp, requireUser } from "./policies.js";

export const updateProfile = serverFunction({
  input: z.object({
    bio: z.string().min(10).max(160),
  }),
  policies: [requireUser, rateLimitByIp],
  handler: async (context, input) => {
    await db.user.update({
      where: { id: context.user.id },
      data: { bio: input.bio },
    });

    return { ok: true };
  },
});

export const sendWelcomeEmail = serverFunction({
  input: z.object({
    email: z.email(),
  }),
  policies: [requireUser],
  handler: async (_context, input) => {
    await supportInbox.sendWelcomeEmail({
      email: input.email,
    });

    return { ok: true };
  },
});

export const submitSupportTicket = serverFunction({
  input: z.object({
    email: z.email(),
    message: z.string().min(20),
  }),
  policies: [rateLimitByIp],
  handler: async (_context, input) => {
    await supportInbox.createTicket({
      email: input.email,
      message: input.message,
    });

    return { ok: true };
  },
});
