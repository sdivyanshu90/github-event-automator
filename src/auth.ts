import NextAuth from "next-auth";
import GitHub from "next-auth/providers/github";
import { eq } from "drizzle-orm";
import { database } from "@/db";
import { users } from "@/db/schema";
import { encryptSecret } from "@/lib/crypto";

interface GitHubProfile {
  id: number;
  login: string;
  name?: string | null;
  email?: string | null;
  avatar_url?: string | null;
}

export const { handlers, auth, signIn, signOut } = NextAuth({
  secret: process.env.AUTH_SECRET,
  trustHost: true,
  session: { strategy: "jwt", maxAge: 60 * 60 * 24 * 7 },
  providers: [
    GitHub({
      clientId: process.env.GITHUB_CLIENT_ID ?? "",
      clientSecret: process.env.GITHUB_CLIENT_SECRET ?? "",
      authorization: { params: { scope: "read:user user:email" } },
    }),
  ],
  pages: { signIn: "/signin", error: "/signin" },
  callbacks: {
    async signIn({ profile, account }) {
      const github = profile as GitHubProfile | undefined;
      if (!github?.id || !github.login) return false;
      await database()
        .insert(users)
        .values({
          githubId: String(github.id),
          login: github.login,
          name: github.name ?? null,
          email: github.email ?? null,
          avatarUrl: github.avatar_url ?? null,
          githubTokenEncrypted: account?.access_token ? encryptSecret(account.access_token) : null,
        })
        .onConflictDoUpdate({
          target: users.githubId,
          set: {
            login: github.login,
            name: github.name ?? null,
            email: github.email ?? null,
            avatarUrl: github.avatar_url ?? null,
            ...(account?.access_token ? { githubTokenEncrypted: encryptSecret(account.access_token) } : {}),
            updatedAt: new Date(),
          },
        });
      return true;
    },
    async jwt({ token, profile }) {
      const github = profile as GitHubProfile | undefined;
      if (github?.id) {
        const [record] = await database().select().from(users).where(eq(users.githubId, String(github.id))).limit(1);
        if (record) {
          token.appUserId = record.id;
          token.githubId = record.githubId;
          token.login = record.login;
        }
      }
      return token;
    },
    session({ session, token }) {
      if (session.user && typeof token.appUserId === "string") {
        session.user.id = token.appUserId;
        session.user.githubId = String(token.githubId ?? "");
        session.user.login = String(token.login ?? token.name ?? "");
      }
      return session;
    },
    authorized({ auth: session }) {
      return Boolean(session?.user?.id);
    },
  },
});
