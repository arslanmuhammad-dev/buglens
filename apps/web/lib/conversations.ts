import { db } from "./db";
import { hashToken, validToken } from "./access";
import { HttpError } from "./http";
import { notificationRecipients } from "./reports";
import { z } from "zod";
export const messageSchema = z
  .object({
    clientId: z.string().uuid(),
    body: z.string().trim().min(1).max(4000),
  })
  .strict();
export async function trackedReport(id: string, token: string) {
  if (!validToken(token)) return null;
  return db.report.findFirst({
    where: {
      id,
      trackingHash: hashToken(token),
      trackingExpiresAt: { gt: new Date() },
    },
  });
}
export async function publicReport(id: string) {
  return db.report.findUnique({
    where: { id },
    select: {
      id: true,
      title: true,
      description: true,
      status: true,
      createdAt: true,
      project: { select: { name: true } },
      history: {
        select: { id: true, status: true, createdAt: true },
        orderBy: [{ createdAt: "asc" }, { id: "asc" }],
      },
    },
  });
}
export async function addMessage(
  reportId: string,
  input: z.infer<typeof messageSchema>,
  authorRole: "REPORTER" | "DEVELOPER",
  authorName: string,
  userId?: string,
) {
  const existing = await db.reportMessage.findUnique({
    where: { reportId_clientId: { reportId, clientId: input.clientId } },
  });
  if (existing) {
    if (existing.authorRole !== authorRole || existing.body !== input.body)
      throw new HttpError(409, "Message id already used");
    return existing;
  }
  const report = await db.report.findUniqueOrThrow({ where: { id: reportId } });
  const recipients = await notificationRecipients(
    report.projectId,
    authorRole === "REPORTER" ? "CUSTOMER_REPLY" : "TEAM_REPLY",
    userId,
  );
  try {
    return await db.$transaction(async (tx) => {
      const message = await tx.reportMessage.create({
        data: {
          reportId,
          ...input,
          authorRole,
          authorName: authorName.slice(0, 100),
        },
      });
      await tx.notification.createMany({
        data: recipients.map((r) => ({ ...r, reportId })),
      });
      return message;
    });
  } catch (error) {
    if ((error as { code?: string }).code === "P2002") {
      const result = await db.reportMessage.findUniqueOrThrow({
        where: { reportId_clientId: { reportId, clientId: input.clientId } },
      });
      if (result.authorRole === authorRole && result.body === input.body)
        return result;
      throw new HttpError(409, "Message id already used");
    }
    throw error;
  }
}
export async function reopenReport(id: string) {
  return db.$transaction(
    async (tx) => {
      const report = await tx.report.findUniqueOrThrow({ where: { id } });
      if (report.status !== "RESOLVED") return;
      await tx.report.update({
        where: { id },
        data: {
          status: "OPEN",
          history: { create: { status: "OPEN" } },
          notifications: {
            create: await notificationRecipients(
              report.projectId,
              "CUSTOMER_REOPENED",
            ),
          },
        },
      });
    },
    { isolationLevel: "Serializable" },
  );
}
export async function conversationPage(
  reportId: string,
  cursor: string | null,
) {
  const after = cursor
    ? await db.reportMessage.findFirst({ where: { id: cursor, reportId } })
    : null;
  if (cursor && !after) throw new HttpError(400, "Invalid conversation cursor");
  const messages = await db.reportMessage.findMany({
    where: {
      reportId,
      ...(after
        ? {
            OR: [
              { createdAt: { gt: after.createdAt } },
              { createdAt: after.createdAt, id: { gt: after.id } },
            ],
          }
        : {}),
    },
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    take: 51,
  });
  const page = messages.slice(0, 50);
  return {
    messages: page,
    nextCursor: messages.length > 50 ? page.at(-1)!.id : null,
  };
}
