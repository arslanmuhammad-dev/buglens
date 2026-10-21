import { projectAccess } from "../../../lib/access";
import { communicationApi, trackingApi } from "../../../lib/communication-api";
import { NextRequest, NextResponse } from "next/server";
import { auth } from "../../../lib/auth";
import { db } from "../../../lib/db";
import { appUrl } from "../../../lib/config";
import { storage, InvalidScreenshotError } from "../../../lib/storage";
import {
  ownedReport,
  deleteReport,
  updateTriage,
  createReport,
} from "../../../lib/reports";
import { consumeLimit } from "../../../lib/rate-limit";
import { readJson, HttpError } from "../../../lib/http";
import {
  MAX_BODY,
  payloadSchema,
  projectSchema,
  triageSchema,
} from "@buglens/core";
import { z } from "zod";
export const runtime = "nodejs";
const json = (data: unknown, status = 200) =>
  NextResponse.json(data, {
    status,
    headers: {
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
const methodNotAllowed = (allow: string) =>
  new NextResponse(null, { status: 405, headers: { Allow: allow } });
async function ingest(req: NextRequest) {
  const origin = req.headers.get("origin") || "";
  const cors = {
    "Access-Control-Allow-Origin": origin,
    Vary: "Origin",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
  };
  let response: NextResponse;
  try {
    if (req.method === "OPTIONS")
      return new NextResponse(null, { status: 204, headers: cors });
    if (req.method !== "POST") return methodNotAllowed("POST, OPTIONS");
    if (!(await consumeLimit("ingest:global", 200)))
      throw new HttpError(429, "Ingestion busy. Try again in a minute.");
    const payload = payloadSchema.parse(await readJson(req, MAX_BODY));
    const project = await db.project.findUnique({
      where: { key: payload.projectKey },
    });
    if (!project || !project.origins.includes(origin))
      throw new HttpError(403, "Project or origin not allowed");
    if (payload.submissionId) {
      const existing = await db.report.findUnique({
        where: {
          projectId_submissionId: {
            projectId: project.id,
            submissionId: payload.submissionId,
          },
        },
      });
      if (existing) {
        response = json({ id: existing.id }, 200);
        for (const [k, v] of Object.entries(cors)) response.headers.set(k, v);
        return response;
      }
    }
    if (!(await consumeLimit("ingest:project:" + project.id, 20)))
      throw new HttpError(429, "Too many reports. Try again in a minute.");
    const report = await createReport(project.id, payload);
    response = json({ id: report.id }, 201);
  } catch (e) {
    response = errorResponse(e);
  }
  for (const [k, v] of Object.entries(cors)) response.headers.set(k, v);
  if (response.status === 429) response.headers.set("Retry-After", "60");
  return response;
}
function errorResponse(e: unknown) {
  if (e instanceof InvalidScreenshotError)
    return json({ error: e.message }, 400);
  if (e instanceof HttpError) return json({ error: e.message }, e.status);
  if (e instanceof z.ZodError)
    return json(
      { error: "Invalid fields", fields: e.flatten().fieldErrors },
      400,
    );
  if ((e as { code?: string })?.code === "P2034")
    return json({ error: "Another change is in progress. Please retry." }, 409);
  if ((e as { code?: string })?.code === "ENOENT")
    return json({ error: "Screenshot not found" }, 404);
  console.error(
    "API operation failed",
    e instanceof Error ? e.name : "Unknown",
  );
  return json({ error: "Operation failed. Please retry." }, 500);
}
async function handle(req: NextRequest) {
  const parts = req.nextUrl.pathname.slice(5).split("/");
  const [resource, id, action] = parts;
  if (resource === "ingest" && parts.length === 1) return ingest(req);
  try {
    if (resource === "track") return await trackingApi(req, parts);
    if (resource === "demo-order" && parts.length === 1)
      return req.method === "POST"
        ? json({ error: "Intentional demo: payment service unavailable" }, 503)
        : methodNotAllowed("POST");
    if (
      ![
        "projects",
        "reports",
        "teams",
        "invitations",
        "notifications",
      ].includes(resource) ||
      parts.length > 3
    )
      return json({ error: "Not found" }, 404);
    const session = await auth.api.getSession({ headers: req.headers });
    if (!session) return json({ error: "Unauthorized" }, 401);
    const ownerId = session.user.id;
    const origin = new URL(appUrl() || req.url).origin;
    if (
      !["GET", "HEAD"].includes(req.method) &&
      req.headers.get("origin") !== origin
    )
      throw new HttpError(403, "Invalid request origin");
    const communication = await communicationApi(req, parts, session.user);
    if (communication) return communication;
    if (resource === "projects") {
      if (action) return json({ error: "Not found" }, 404);
      if (req.method === "GET" && !id)
        return json(
          await db.project.findMany({
            where: projectAccess(ownerId),
            include: {
              members: { where: { userId: ownerId }, select: { userId: true } },
            },
            orderBy: { createdAt: "asc" },
          }),
        );
      if (req.method === "POST" && !id) {
        const input = projectSchema.parse(await readJson(req, 10000));
        return json(
          await db.project.create({ data: { ...input, ownerId } }),
          201,
        );
      }
      if (req.method === "PATCH" && id) {
        const input = projectSchema.parse(await readJson(req, 10000));
        const project = await db.project.updateMany({
          where: { id, ownerId },
          data: input,
        });
        return project.count
          ? json({ ok: true })
          : json({ error: "Not found" }, 404);
      }
      return methodNotAllowed(id ? "PATCH" : "GET, POST");
    }
    if (!id) {
      if (req.method !== "GET") return methodNotAllowed("GET");
      const q = req.nextUrl.searchParams;
      const page = z.coerce
        .number()
        .int()
        .min(1)
        .max(100000)
        .parse(q.get("page") || 1);
      const status = q.get("status")
        ? z.enum(["OPEN", "IN_PROGRESS", "RESOLVED"]).parse(q.get("status"))
        : undefined;
      const severity = q.get("severity")
        ? z.enum(["LOW", "MEDIUM", "HIGH"]).parse(q.get("severity"))
        : undefined;
      const where = {
        project: projectAccess(ownerId),
        ...(q.get("project") ? { projectId: q.get("project")! } : {}),
        ...(status ? { status } : {}),
        ...(severity ? { severity } : {}),
        title: {
          contains: (q.get("q") || "").slice(0, 160),
          mode: "insensitive" as const,
        },
      };
      const [reports, total] = await db.$transaction([
        db.report.findMany({
          where,
          include: { project: true },
          orderBy: [{ createdAt: "desc" }, { id: "desc" }],
          skip: (page - 1) * 8,
          take: 8,
        }),
        db.report.count({ where }),
      ]);
      return json({ reports, total, page });
    }
    if (action && !["notes", "screenshot"].includes(action))
      return json({ error: "Not found" }, 404);
    const owned = await ownedReport(id, ownerId);
    if (!owned) return json({ error: "Not found" }, 404);
    if (action === "screenshot") {
      if (req.method !== "GET") return methodNotAllowed("GET");
      if (!owned.screenshot) return json({ error: "Not found" }, 404);
      return new NextResponse(
        new Uint8Array(await storage.get(owned.screenshot.filename)),
        {
          headers: {
            "Content-Type": "image/png",
            "Cache-Control": "private, no-store",
            "X-Content-Type-Options": "nosniff",
            "Content-Disposition": 'inline; filename="buglens-report.png"',
          },
        },
      );
    }
    if (action === "notes") {
      if (req.method === "POST") {
        const input = z
          .object({ body: z.string().trim().min(1).max(2000) })
          .strict()
          .parse(await readJson(req, 10000));
        return json(
          await db.internalNote.create({
            data: { reportId: id, body: input.body },
          }),
          201,
        );
      }
      if (req.method === "DELETE") {
        const note = req.nextUrl.searchParams.get("note");
        if (!note) throw new HttpError(400, "Note id required");
        const result = await db.internalNote.deleteMany({
          where: { id: note, reportId: id },
        });
        return result.count
          ? json({ ok: true })
          : json({ error: "Note not found" }, 404);
      }
      return methodNotAllowed("POST, DELETE");
    }
    if (req.method === "GET")
      return json(
        await db.report.findFirst({
          where: { id, project: projectAccess(ownerId) },
          include: {
            project: true,
            screenshot: { select: { id: true } },
            events: { orderBy: { order: "asc" } },
            notes: { orderBy: [{ createdAt: "asc" }, { id: "asc" }] },
            history: { orderBy: [{ createdAt: "asc" }, { id: "asc" }] },
          },
        }),
      );
    if (req.method === "DELETE") {
      if (
        !(await db.project.findFirst({
          where: { id: owned.projectId, ownerId },
        }))
      )
        return json({ error: "Not found" }, 404);
      await deleteReport(id, ownerId);
      return json({ ok: true });
    }
    if (req.method === "PATCH") {
      const input = triageSchema.parse(await readJson(req, 10000));
      const report = await updateTriage(id, ownerId, input);
      return report ? json({ ok: true }) : json({ error: "Not found" }, 404);
    }
    return methodNotAllowed("GET, PATCH, DELETE");
  } catch (e) {
    return errorResponse(e);
  }
}
export {
  handle as GET,
  handle as POST,
  handle as PATCH,
  handle as DELETE,
  handle as OPTIONS,
};
