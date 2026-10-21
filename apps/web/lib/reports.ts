import { projectAccess, hashToken } from "./access";
import { db } from "./db";
import { storage, decodeImage } from "./storage";
export async function ownedReport(id: string, ownerId: string) {
  return db.report.findFirst({
    where: { id, project: projectAccess(ownerId) },
    include: { screenshot: true },
  });
}
export async function deleteReport(id: string, ownerId: string) {
  const report = await ownedReport(id, ownerId);
  if (
    !report ||
    !(await db.project.findFirst({ where: { id: report.projectId, ownerId } }))
  )
    return false; // Delete asset first: failure retains a retryable database record.
  if (report.screenshot) await storage.delete(report.screenshot.filename);
  await db.report.delete({ where: { id } });
  return true;
}
export async function updateTriage(
  id: string,
  ownerId: string,
  input: { status?: string; severity?: string },
) {
  return db.$transaction(
    async (tx) => {
      const report = await tx.report.findFirst({
        where: { id, project: projectAccess(ownerId) },
      });
      if (!report) return null;

      return tx.report.update({
        where: { id },
        data: {
          ...input,
          ...(input.status && input.status !== report.status
            ? {
                history: { create: { status: input.status } },
                notifications: {
                  create: await notificationRecipients(
                    report.projectId,
                    "STATUS_CHANGED",
                    ownerId,
                  ),
                },
              }
            : {}),
        },
      });
    },
    { isolationLevel: "Serializable" },
  );
}

export function setStatus(id: string, ownerId: string, status: string) {
  return updateTriage(id, ownerId, { status });
}

import { payloadSchema } from "@buglens/core";
import type { z } from "zod";
export async function createReport(
  projectId: string,
  payload: z.infer<typeof payloadSchema>,
) {
  if (payload.submissionId) {
    const existing = await db.report.findUnique({
      where: {
        projectId_submissionId: {
          projectId,
          submissionId: payload.submissionId,
        },
      },
    });
    if (existing) return existing;
  }
  let filename: string | undefined;
  try {
    const image = payload.screenshot
      ? await decodeImage(payload.screenshot)
      : null;
    if (image) filename = await storage.put(image);
    const report = await db.report.create({
      data: {
        title: payload.title,
        description: payload.description,
        steps: payload.steps,
        expected: payload.expected,
        pageUrl: payload.pageUrl,
        browser: payload.browser,
        viewport: payload.viewport,
        projectId,
        submissionId: payload.submissionId,
        reporterName: payload.reporterName || null,
        reporterEmail: payload.reporterEmail || null,
        trackingHash: payload.trackingToken
          ? hashToken(payload.trackingToken)
          : null,
        trackingExpiresAt: payload.trackingToken
          ? new Date(Date.now() + 90 * 86400000)
          : null,
        notifications: {
          create: await notificationRecipients(projectId, "NEW_REPORT"),
        },
        events: {
          create: payload.events.map((data, order) => ({
            data,
            order,
          })),
        },
        history: { create: { status: "OPEN" } },
        ...(filename && image
          ? {
              screenshot: {
                create: {
                  filename,
                  mime: "image/png",
                  bytes: image.length,
                },
              },
            }
          : {}),
      },
    });
    return report;
  } catch (e) {
    if (filename) await storage.delete(filename);
    if (payload.submissionId && (e as { code?: string }).code === "P2002") {
      const existing = await db.report.findUnique({
        where: {
          projectId_submissionId: {
            projectId,
            submissionId: payload.submissionId,
          },
        },
      });
      if (existing) return existing;
    }
    throw e;
  }
}

export async function notificationRecipients(
  projectId: string,
  kind: string,
  excludeId?: string,
) {
  const project = await db.project.findUniqueOrThrow({
    where: { id: projectId },
    include: { members: true },
  });
  return [
    ...new Set([project.ownerId, ...project.members.map((m) => m.userId)]),
  ]
    .filter((userId) => userId !== excludeId)
    .map((userId) => ({ userId, kind }));
}
