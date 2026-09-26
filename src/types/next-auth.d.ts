import "next-auth";

declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      githubId: string;
      login: string;
      name?: string | null;
      email?: string | null;
      image?: string | null;
    };
  }
}
