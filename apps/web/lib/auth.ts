import { betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { db } from "./db";
import { appUrl } from "./config";
export const auth = betterAuth({
  database: prismaAdapter(db, { provider: "postgresql" }),
  emailAndPassword: { enabled: true, minPasswordLength: 10 },
  rateLimit: { enabled: true, storage: "database" },
  baseURL: appUrl(),
  secret: process.env.BETTER_AUTH_SECRET,
});
