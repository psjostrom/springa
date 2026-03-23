import NextAuth from "next-auth";
import Google from "next-auth/providers/google";
import { db } from "./db";

export const { handlers, signIn, signOut, auth } = NextAuth({
  providers: [
    Google({
      clientId: process.env.GOOGLE_CLIENT_ID,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET,
    }),
  ],
  session: { strategy: "jwt" },
  pages: { signIn: "/login" },
  callbacks: {
    async signIn({ user }) {
      if (!user.email) return false;
      const result = await db().execute({
        sql: "SELECT approved FROM user_settings WHERE email = ?",
        args: [user.email],
      });
      if (result.rows.length === 0) return false;
      return (result.rows[0].approved as number) === 1;
    },
  },
});
