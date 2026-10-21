import { NextRequest, NextResponse } from "next/server";
import { auth } from "../../../lib/auth";
import { db } from "../../../lib/db";
import { storage } from "../../../lib/storage";
import {
  ownedReport,
  deleteReport,
  setStatus,
  createReport,
} from "../../../lib/reports";
import { MAX_BODY, payloadSchema, RateLimiter } from "@buglens/core";
import { z } from "zod";
export const runtime = "nodejs";
const limiter = new RateLimiter();
const publicLimiter = new RateLimiter(200);
const json = (data: unknown, status = 200) =>
  NextResponse.json(data, { status });
async function body(req: NextRequest, max = MAX_BODY) {
  if (Number(req.headers.get("content-length")) > max)
    throw new Error("BODY_LIMIT");
  const reader = req.body?.getReader();
  if (!reader) return {};
  let size = 0;
  const chunks: Uint8Array[] = [];
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.length;
    if (size > max) {
      await reader.cancel();
      throw Error("BODY_LIMIT");
    }
    chunks.push(value);
  }
  return JSON.parse(Buffer.concat(chunks).toString());
}
async function handle(req: NextRequest) {
  const parts = req.nextUrl.pathname.slice(5).split("/");
  const [resource, id, action] = parts;
  try {
    if (resource === "demo-order")
      return json(
        { error: "Intentional demo: payment service unavailable" },
        503,
      );
    if (resource === "ingest") {
      const origin = req.headers.get("origin") || "";
      const cors = {
        "Access-Control-Allow-Origin": origin,
        Vary: "Origin",
        "Access-Control-Allow-Methods": "POST, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type",
      };
      if (req.method === "OPTIONS")
        return new NextResponse(null, { status: 204, headers: cors });
      if (req.method !== "POST")
        return json({ error: "Method not allowed" }, 405);
      let result: NextResponse;
      try {
        if (!publicLimiter.allow("global"))
          return json({ error: "Ingestion busy" }, 429);
        const payload = payloadSchema.parse(await body(req));
        const project = await db.project.findUnique({
          where: { key: payload.projectKey },
        });
        if (!project || !project.origins.includes(origin))
          result = json({ error: "Project or origin not allowed" }, 403);
        else if (!limiter.allow(project.id))
          result = json({ error: "Too many reports. Try again shortly." }, 429);
        else {
          const report = await createReport(project.id, payload);
          result = json({ id: report.id }, 201);
        }
      } catch (e) {
        result = json(
          {
            error:
              e instanceof Error && e.message === "BODY_LIMIT"
                ? "Payload too large"
                : "Invalid report payload",
          },
          e instanceof Error && e.message === "BODY_LIMIT" ? 413 : 400,
        );
      }
      for (const [k, v] of Object.entries(cors)) result.headers.set(k, v);
      return result;
    }
    const session = await auth.api.getSession({ headers: req.headers });
    if (!session) return json({ error: "Unauthorized" }, 401);
    const ownerId = session.user.id;
    if (
      !["GET", "HEAD"].includes(req.method) &&
      req.headers.get("origin") !==
        new URL(process.env.BETTER_AUTH_URL || req.url).origin
    )
      return json({ error: "Invalid request origin" }, 403);
    if (resource === "projects") {
      if (req.method === "GET")
        return json(
          await db.project.findMany({
            where: { ownerId },
            orderBy: { createdAt: "asc" },
          }),
        );
      const input = z
        .object({
          name: z.string().trim().min(1).max(80),
          origins: z
            .array(
              z
                .string()
                .url()
                .refine(
                  (v) => new URL(v).origin === v,
                  "Use an origin without a path",
                ),
            )
            .min(1)
            .max(20),
        })
        .parse(await body(req, 10000));
      if (req.method === "POST")
        return json(
          await db.project.create({ data: { ...input, ownerId } }),
          201,
        );
      if (req.method === "PATCH" && id) {
        const p = await db.project.updateMany({
          where: { id, ownerId },
          data: input,
        });
        return json(p, p.count ? 200 : 404);
      }
    }
    if (resource === "reports") {
      if (!id && req.method === "GET") {
        const q = req.nextUrl.searchParams;
        const page = Math.max(1, Math.min(100000, Number(q.get("page")) || 1));
        const where = {
          project: { ownerId },
          ...(q.get("project") ? { projectId: q.get("project")! } : {}),
          ...(q.get("status") ? { status: q.get("status")! } : {}),
          ...(q.get("severity") ? { severity: q.get("severity")! } : {}),
          title: {
            contains: (q.get("q") || "").slice(0, 160),
            mode: "insensitive" as const,
          },
        };
        const [reports, total] = await Promise.all([
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
      if (!id) return json({ error: "Report id required" }, 400);
      const owned = await ownedReport(id, ownerId);
      if (!owned) return json({ error: "Not found" }, 404);
      if (action === "screenshot" && req.method === "GET") {
        if (!owned.screenshot) return json({ error: "Not found" }, 404);
        return new NextResponse(
          new Uint8Array(await storage.get(owned.screenshot.filename)),
          {
            headers: {
              "Content-Type": "image/png",
              "Cache-Control": "private, no-store",
              "X-Content-Type-Options": "nosniff",
            },
          },
        );
      }
      if (action === "notes") {
        if (req.method === "POST") {
          const input = z
            .object({ body: z.string().trim().min(1).max(2000) })
            .parse(await body(req, 10000));
          return json(
            await db.internalNote.create({
              data: { reportId: id, body: input.body },
            }),
            201,
          );
        }
        if (req.method === "DELETE") {
          const note = req.nextUrl.searchParams.get("note") || "";
          return json(
            await db.internalNote.deleteMany({
              where: { id: note, reportId: id },
            }),
          );
        }
      }
      if (req.method === "GET")
        return json(
          await db.report.findUnique({
            where: { id },
            include: {
              project: true,
              screenshot: { select: { id: true } },
              events: { orderBy: { order: "asc" } },
              notes: { orderBy: { createdAt: "asc" } },
              history: { orderBy: { createdAt: "asc" } },
            },
          }),
        );
      if (req.method === "DELETE") {
        await deleteReport(id, ownerId);
        return json({ ok: true });
      }
      if (req.method === "PATCH") {
        const input = z
          .object({
            status: z.enum(["OPEN", "IN_PROGRESS", "RESOLVED"]).optional(),
            severity: z.enum(["LOW", "MEDIUM", "HIGH"]).optional(),
          })
          .parse(await body(req, 10000));
        if (input.status) await setStatus(id, ownerId, input.status);
        if (input.severity)
          await db.report.update({
            where: { id },
            data: { severity: input.severity },
          });
        return json({ ok: true });
      }
    }
    return json({ error: "Not found" }, 404);
  } catch (e) {
    if (e instanceof z.ZodError) return json({ error: "Invalid fields" }, 400);
    if (e instanceof Error && e.message === "BODY_LIMIT")
      return json({ error: "Payload too large" }, 413);
    console.error(
      "API operation failed",
      e instanceof Error ? e.name : "Unknown",
    );
    return json({ error: "Operation failed. Please retry." }, 500);
  }
}
export {
  handle as GET,
  handle as POST,
  handle as PATCH,
  handle as DELETE,
  handle as OPTIONS,
};
