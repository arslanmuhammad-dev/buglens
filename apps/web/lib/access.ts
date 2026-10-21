import { createHash, randomBytes } from "node:crypto";
import type { Prisma } from "@prisma/client";
export const projectAccess = (userId: string): Prisma.ProjectWhereInput => ({
  OR: [{ ownerId: userId }, { members: { some: { userId } } }],
});
export const hashToken = (token: string) =>
  createHash("sha256").update(token).digest("hex");
export const newToken = () => randomBytes(32).toString("base64url");
export const validToken = (token: string) => /^[A-Za-z0-9_-]{43}$/.test(token);
