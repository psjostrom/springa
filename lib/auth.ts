import NextAuth from "next-auth";
import Google from "next-auth/providers/google";
import { db } from "./db";
import { encrypt, getEncryptionKey } from "./credentials";

export const { handlers, signIn, signOut, auth } = NextAuth({
  providers: [
    Google({
      clientId: process.env.GOOGLE_CLIENT_ID,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET,
      authorization: {
        params: {
          scope: "openid email profile https://www.googleapis.com/auth/calendar",
          access_type: "offline",
          // Always prompt consent to guarantee a refresh token on every sign-in.
          // Simpler than conditional consent (spec mentions dynamic, but not worth the complexity).
          prompt: "consent",
        },
      },
    }),
  ],
  session: { strategy: "jwt" },
  pages: { signIn: "/login" },
  callbacks: {
    async signIn({ user, account }) {
      if (!user.email) return false;
      // Upsert: create user row if it doesn't exist (race-safe)
      await db().execute({
        sql: "INSERT OR IGNORE INTO user_settings (email) VALUES (?)",
        args: [user.email],
      });

      // Store refresh token when Google provides one (on consent).
      // Wrapped in try/catch: safe to deploy before migration adds the column.
      if (account?.refresh_token) {
        try {
          const encKey = getEncryptionKey();
          await db().execute({
            sql: "UPDATE user_settings SET google_refresh_token = ? WHERE email = ?",
            args: [encrypt(account.refresh_token, encKey), user.email],
          });
        } catch {
          // Column may not exist yet if migration hasn't run
        }
      }

      return true;
    },
  },
});
