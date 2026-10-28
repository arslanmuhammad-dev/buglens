import { enqueueMail, mailEnabled } from "./mail";
import { consumeLimit } from "./rate-limit";
import { hashToken } from "./access";
import { betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { db } from "./db";
import { appUrl } from "./config";
export const auth = betterAuth({
  database: prismaAdapter(db, { provider: "postgresql" }),
  emailAndPassword: {
    enabled: true,
    minPasswordLength: 10,
    maxPasswordLength: 128,
    resetPasswordTokenExpiresIn: 1800,
    revokeSessionsOnPasswordReset: true,
    sendResetPassword: async ({ user, token }) => {
      if (!mailEnabled()) throw Error("Email is not configured");
      if (
        !(await consumeLimit(
          "reset-email:" + hashToken(user.email.toLowerCase()),
          3,
          15 * 60000,
        ))
      )
        return;
      const url = new URL("/reset-password", appUrl());
      url.hash = token;
      await enqueueMail({
        kind: "PASSWORD_RESET",
        userId: user.id,
        dedupeKey: "reset:" + hashToken(token),
        expiresAt: new Date(Date.now() + 1800000),
        mail: {
          to: user.email,
          subject: "Reset your BugLens password",
          text: `A password reset was requested for your BugLens account.

${url.href}

This link expires in 30 minutes and works once. If you did not request this, ignore this email. Never share this link.`,
        },
      });
    },
    onPasswordReset: async ({ user }) => {
      if (!mailEnabled()) return;
      await enqueueMail({
        kind: "PASSWORD_CHANGED",
        userId: user.id,
        dedupeKey: "password-changed:" + user.id + ":" + Date.now(),
        expiresAt: new Date(Date.now() + 86400000),
        mail: {
          to: user.email,
          subject: "Your BugLens password was changed",
          text: "Your BugLens password was changed and your previous sessions were signed out. If this was not you, request a new reset link from your BugLens sign-in page immediately.",
        },
      });
    },
  },
  rateLimit: { enabled: true, storage: "database" },
  baseURL: appUrl(),
  secret: process.env.BETTER_AUTH_SECRET,
});
