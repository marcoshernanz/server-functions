// @ts-nocheck

"use server";

import { policy, serverFunction } from "next/server";
import { z } from "zod";

import { getSession } from "@/lib/auth";
import { db } from "@/lib/db";
import { ratelimit } from "@/lib/ratelimit";
import { supportInbox } from "@/lib/support";

// In a real app these policies would likely live in a shared file.
export const requireUser = () =>
  policy(async () => {
    const session = await getSession();

    if (!session?.user) {
      throw new Error("Unauthorized");
    }

    return { user: session.user };
  });

export const rateLimitByIp = () =>
  policy(async ({ ip, headers }) => {
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
  validate: (input) => updateProfileSchema.parse(input),
  use: [requireUser(), rateLimitByIp()],
}).run(async ({ input }, { ctx }) => {
  await db.user.update({
    where: { id: ctx.user.id },
    data: { bio: input.bio },
  });

  return { ok: true };
});

const contactFormSchema = z.object({
  email: z.string().email(),
  message: z.string().min(20),
});

export const submitContactForm = serverFunction({
  validate: (input) => contactFormSchema.parse(input),
  use: [rateLimitByIp()],
}).run(async ({ input }) => {
  await supportInbox.createTicket({
    email: input.email,
    message: input.message,
  });

  return { ok: true };
});

// Optional framework-level config still lives outside the per-function API.
//
// next.config.ts
// export default {
//   experimental: {
//     serverActions: {
//       allowedOrigins: ["app.example.com"],
//       bodySizeLimit: "1mb",
//     },
//   },
// };
