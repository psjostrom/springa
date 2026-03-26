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
      const result = await db().execute({
        sql: "SELECT approved, google_refresh_token FROM user_settings WHERE email = ?",
        args: [user.email],
      });
      if (result.rows.length === 0) return false;
      if ((result.rows[0].approved as number | null ?? 0) !== 1) return false;

      // Store refresh token when Google provides one (on consent)
      if (account?.refresh_token) {
        const encKey = getEncryptionKey();
        await db().execute({
          sql: "UPDATE user_settings SET google_refresh_token = ? WHERE email = ?",
          args: [encrypt(account.refresh_token, encKey), user.email],
        });
      }

      return true;
    },
  },
});
