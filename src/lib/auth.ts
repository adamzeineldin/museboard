import "server-only";
import NextAuth from "next-auth";
import Facebook from "next-auth/providers/facebook";
import Google from "next-auth/providers/google";
import Nodemailer from "next-auth/providers/nodemailer";
import { writeAudit } from "./audit";
import { isProviderConfigured } from "./auth-providers";
import { createAuthAdapter } from "./auth-adapter";
import { deliverMagicLink } from "./auth-mail";
import { sendMagicLinkWithinLimit } from "./auth-rate-limit";
import { db } from "./db";

// Auth.js v5: email magic link (Nodemailer provider), plus Google and Meta (Facebook) when their credentials are
// set, with the Prisma adapter and database sessions.
// Reads AUTH_SECRET and AUTH_URL from the environment. See src/lib/auth-mail.ts for the dev fallback
// used when EMAIL_SERVER is unset.

const DEFAULT_FROM = "Inroad <no-reply@inroad.local>";
// The provider requires a `server` value even though our sendVerificationRequest decides how to deliver.
const UNUSED_SMTP_PLACEHOLDER = "smtp://localhost:25";

export const { handlers, auth, signIn, signOut } = NextAuth({
  adapter: createAuthAdapter(db),
  session: { strategy: "database" },
  pages: {
    signIn: "/signin",
    verifyRequest: "/signin/check-email",
    error: "/signin",
    newUser: "/onboarding",
  },
  providers: [
    // Google verifies the address, so a Google sign-in may join an account first made with an email link.
    ...(isProviderConfigured("google") ? [Google({ allowDangerousEmailAccountLinking: true })] : []),
    // Facebook addresses are not always verified, so no automatic linking: the user signs in the way they started.
    ...(isProviderConfigured("facebook") ? [Facebook] : []),
    Nodemailer({
      server: process.env.EMAIL_SERVER || UNUSED_SMTP_PLACEHOLDER,
      from: process.env.EMAIL_FROM || DEFAULT_FROM,
      async sendVerificationRequest({ identifier, url, provider }) {
        await sendMagicLinkWithinLimit(identifier, () =>
          deliverMagicLink({
            identifier,
            url,
            from: provider.from ?? DEFAULT_FROM,
            emailServer: process.env.EMAIL_SERVER || undefined,
          }),
        );
      },
    }),
  ],
  callbacks: {
    session({ session, user }) {
      return { ...session, user: { ...session.user, id: user.id } };
    },
  },
  events: {
    async createUser({ user }) {
      if (user.id) {
        await writeAudit(user.id, "user", "account.created", { via: "email" });
      }
    },
  },
});
