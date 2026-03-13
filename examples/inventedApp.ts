export type User = {
  id: string;
  email: string;
  bio: string;
};

export type Session = {
  user: User;
};

export type Organization = {
  id: string;
  slug: string;
  ownerUserId: string;
};

export async function getSession(): Promise<Session | null> {
  return {
    user: {
      id: "user_123",
      email: "user@example.com",
      bio: "I like safe server functions.",
    },
  };
}

export const ratelimit = {
  async limit(_subject: string): Promise<{ success: boolean }> {
    return { success: true };
  },
};

export const db = {
  user: {
    async update(_args: {
      where: { id: string };
      data: { bio: string };
    }): Promise<void> {},
  },
  organization: {
    async findBySlug(slug: string): Promise<Organization | null> {
      return {
        id: "org_123",
        slug,
        ownerUserId: "user_123",
      };
    },
  },
  organizationInvite: {
    async create(_args: {
      organizationId: string;
      email: string;
      invitedByUserId: string;
    }): Promise<void> {},
  },
};

export const supportInbox = {
  async createTicket(_args: {
    email: string;
    message: string;
  }): Promise<void> {},
};
