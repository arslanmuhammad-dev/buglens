import { NextRequest, NextResponse } from "next/server";
import { db } from "./db";
import { ownedReport } from "./reports";
import { hashToken, newToken, projectAccess } from "./access";
import { readJson, HttpError } from "./http";
import { consumeLimit } from "./rate-limit";
import {
  trackedReport,
  publicReport,
  addMessage,
  messageSchema,
  reopenReport,
  conversationPage,
} from "./conversations";
import { appUrl } from "./config";
import { z } from "zod";
const json = (value: unknown, status = 200) =>
  NextResponse.json(value, {
    status,
    headers: {
      "Cache-Control": "private, no-store",
      "Referrer-Policy": "no-referrer",
      "X-Content-Type-Options": "nosniff",
    },
  });
const notFound = () => json({ error: "Not found" }, 404);
export async function trackingApi(req: NextRequest, parts: string[]) {
  const [, id, action] = parts;
  if (!id || parts.length > 3) return notFound();
  if (!(await consumeLimit("tracking:global", 1000)))
    throw new HttpError(429, "Please retry in a minute.");
  const token = req.headers.get("authorization")?.replace(/^Bearer /, "") || "";
  const report = await trackedReport(id, token);
  if (!report) return notFound();
  if (
    req.method !== "GET" &&
    req.headers.get("origin") !== new URL(appUrl() || req.url).origin
  )
    throw new HttpError(403, "Invalid request origin");
  if (req.method === "GET" && !action) return json(await publicReport(id));
  if (req.method === "GET" && action === "messages")
    return json(
      await conversationPage(id, req.nextUrl.searchParams.get("cursor")),
    );
  if (req.method === "POST" && action === "messages") {
    if (!(await consumeLimit("reply:" + id, 20)))
      throw new HttpError(429, "Too many replies. Try again in a minute.");
    const input = messageSchema.parse(await readJson(req, 20000));
    return json(
      await addMessage(
        id,
        input,
        "REPORTER",
        report.reporterName || "Reporter",
      ),
      201,
    );
  }
  if (req.method === "POST" && action === "reopen") {
    await readJson(req, 100);
    await reopenReport(id);
    return json({ ok: true });
  }
  return json({ error: "Method not allowed" }, 405);
}
export async function communicationApi(
  req: NextRequest,
  parts: string[],
  user: { id: string; name: string; email: string },
) {
  const [resource, id, action] = parts;
  if (resource === "notifications") {
    if (parts.length !== 1) return notFound();
    if (req.method === "GET") {
      // Membership is checked at read time as well as when a notification is created.
      const where = {
        userId: user.id,
        report: { project: projectAccess(user.id) },
      };
      const [items, unread] = await Promise.all([
        db.notification.findMany({
          where,
          include: { report: { select: { id: true, title: true } } },
          orderBy: [{ createdAt: "desc" }, { id: "desc" }],
          take: 50,
        }),
        db.notification.count({ where: { ...where, readAt: null } }),
      ]);
      return json({ items, unread });
    }
    if (req.method === "PATCH") {
      const input = z
        .object({ id: z.string().max(100).optional() })
        .strict()
        .parse(await readJson(req, 1000));
      await db.notification.updateMany({
        where: { userId: user.id, ...(input.id ? { id: input.id } : {}) },
        data: { readAt: new Date() },
      });
      return json({ ok: true });
    }
    return json({ error: "Method not allowed" }, 405);
  }
  if (resource === "invitations") {
    if (parts.length !== 1 || req.method !== "POST") return notFound();
    const { token } = z
      .object({ token: z.string().regex(/^[A-Za-z0-9_-]{43}$/) })
      .strict()
      .parse(await readJson(req, 1000));
    const project = await db.$transaction(
      async (tx) => {
        const invite = await tx.projectInvite.findUnique({
          where: { tokenHash: hashToken(token) },
        });
        if (
          !invite ||
          invite.expiresAt <= new Date() ||
          invite.email !== user.email.toLowerCase()
        )
          throw new HttpError(
            404,
            "Invitation unavailable, expired, or intended for a different email address.",
          );
        const currentMember = await tx.projectMember.findUnique({
          where: {
            projectId_userId: { projectId: invite.projectId, userId: user.id },
          },
        });
        if (
          !currentMember &&
          (await tx.projectMember.count({
            where: { projectId: invite.projectId },
          })) >= 20
        )
          throw new HttpError(
            409,
            "This project already has 20 developers. Ask the owner to remove a member first.",
          );
        await tx.projectMember.upsert({
          where: {
            projectId_userId: { projectId: invite.projectId, userId: user.id },
          },
          update: {},
          create: { projectId: invite.projectId, userId: user.id },
        });
        await tx.projectInvite.delete({ where: { id: invite.id } });
        return tx.project.findUniqueOrThrow({
          where: { id: invite.projectId },
          select: { name: true },
        });
      },
      { isolationLevel: "Serializable" },
    );
    return json(project);
  }
  if (resource === "teams") {
    if (!id || parts.length > 3) return notFound();
    const project = await db.project.findFirst({
      where: { id, ownerId: user.id },
    });
    if (!project) return notFound();
    if (req.method === "GET" && !action)
      return json({
        members: await db.projectMember.findMany({
          where: { projectId: id },
          select: { id: true, user: { select: { name: true, email: true } } },
          orderBy: { createdAt: "asc" },
        }),
        invites: await db.projectInvite.findMany({
          where: { projectId: id, expiresAt: { gt: new Date() } },
          select: { id: true, email: true, expiresAt: true },
          orderBy: { createdAt: "asc" },
        }),
      });
    if (req.method === "POST" && action === "invites") {
      if (!(await consumeLimit("invite:" + user.id, 10)))
        throw new HttpError(
          429,
          "Too many invitations. Try again in a minute.",
        );
      const { email } = z
        .object({ email: z.string().trim().toLowerCase().email().max(254) })
        .strict()
        .parse(await readJson(req, 1000));
      if (email === user.email.toLowerCase())
        throw new HttpError(400, "You already own this project.");
      if ((await db.projectMember.count({ where: { projectId: id } })) >= 20)
        throw new HttpError(
          400,
          "This MVP supports up to 20 developers per project.",
        );
      const token = newToken();
      await db.$transaction([
        db.projectInvite.deleteMany({ where: { projectId: id, email } }),
        db.projectInvite.create({
          data: {
            projectId: id,
            email,
            tokenHash: hashToken(token),
            expiresAt: new Date(Date.now() + 7 * 86400000),
          },
        }),
      ]);
      return json(
        { link: new URL("/join", appUrl() || req.url).href + "#" + token },
        201,
      );
    }
    if (req.method === "DELETE" && ["members", "invites"].includes(action)) {
      const item = req.nextUrl.searchParams.get("id");
      if (!item) throw new HttpError(400, "Select a member or invitation");
      if (action === "members")
        await db.projectMember.deleteMany({
          where: { id: item, projectId: id },
        });
      else
        await db.projectInvite.deleteMany({
          where: { id: item, projectId: id },
        });
      return json({ ok: true });
    }
    return json({ error: "Method not allowed" }, 405);
  }
  if (
    resource === "reports" &&
    id &&
    ["messages", "tracking"].includes(action)
  ) {
    const report = await ownedReport(id, user.id);
    if (!report) return notFound();
    if (action === "tracking" && req.method === "DELETE") {
      const project = await db.project.findFirst({
        where: { id: report.projectId, ownerId: user.id },
      });
      if (!project) return notFound();
      await db.report.update({
        where: { id },
        data: { trackingHash: null, trackingExpiresAt: null },
      });
      return json({ ok: true });
    }
    if (action === "messages" && req.method === "GET")
      return json(
        await conversationPage(id, req.nextUrl.searchParams.get("cursor")),
      );
    if (action === "messages" && req.method === "POST") {
      if (!(await consumeLimit("developer-reply:" + user.id, 30)))
        throw new HttpError(429, "Too many replies. Try again in a minute.");
      const input = messageSchema.parse(await readJson(req, 20000));
      return json(
        await addMessage(id, input, "DEVELOPER", user.name, user.id),
        201,
      );
    }
    return json({ error: "Method not allowed" }, 405);
  }
  return null;
}
