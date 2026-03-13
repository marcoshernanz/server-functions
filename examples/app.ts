export type User = {
  id: string;
  email: string;
  bio: string;
};

export type Session = {
  user: User;
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
};

export const supportInbox = {
  async createTicket(_args: {
    email: string;
    message: string;
  }): Promise<void> {},
  async sendWelcomeEmail(_args: {
    email: string;
  }): Promise<void> {},
};
