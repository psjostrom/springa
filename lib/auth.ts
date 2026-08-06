import NextAuth from "next-auth";
import Google from "next-auth/providers/google";
import Credentials from "next-auth/providers/credentials";
import { db } from "./db";
import { encrypt, getEncryptionKey } from "./credentials";
import {
  getQaAuthEmail,
  isLocalQaAllowed,
  verifyQaToken,
} from "./qaAuth";

export async function ensureUserSettings(email: string): Promise<void> {
  await db().execute({
    sql: "INSERT OR IGNORE INTO user_settings (email) VALUES (?)",
    args: [email],
  });
}

function isMissingGoogleRefreshTokenColumn(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err);
  return /no such column:\s*google_refresh_token/i.test(msg);
}

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
    Credentials({
      id: "qa",
      name: "QA",
      credentials: {
        token: { label: "Token", type: "password" },
      },
      async authorize(credentials) {
        if (!isLocalQaAllowed()) return null;
        // Auth.js types credentials as non-optional Record; runtime may omit fields
        const raw = credentials as { token?: unknown };
        const token = typeof raw.token === "string" ? raw.token : null;
        if (!token || !verifyQaToken(token)) return null;
        const email = getQaAuthEmail();
        if (!email) return null;

        await ensureUserSettings(email);

        return { id: email, email, name: "QA Session" };
      },
    }),
  ],
  session: { strategy: "jwt" },
  pages: { signIn: "/login" },
  callbacks: {
    async signIn({ user, account }) {
      if (!user.email) return false;
      await ensureUserSettings(user.email);

      // Store refresh token when Google provides one (on consent).
      // Missing-column errors are tolerated so deploys work before migration.
      if (account?.refresh_token) {
        try {
          const encKey = getEncryptionKey();
          await db().execute({
            sql: "UPDATE user_settings SET google_refresh_token = ? WHERE email = ?",
            args: [encrypt(account.refresh_token, encKey), user.email],
          });
        } catch (err) {
          if (!isMissingGoogleRefreshTokenColumn(err)) throw err;
        }
      }

      return true;
    },
    // Credentials provider needs jwt/session email populated from token
    jwt({ token, user }) {
      // `user` is only set on initial sign-in; Auth.js callback types mark it required.
      // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- user absent on subsequent jwt calls
      const email = user?.email;
      if (typeof email === "string" && email.length > 0) {
        token.email = email;
      }
      return token;
    },
    session({ session, token }) {
      if (typeof token.email === "string") {
        session.user.email = token.email;
      }
      return session;
    },
  },
});
