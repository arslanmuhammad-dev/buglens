import { after, NextRequest, NextResponse } from "next/server";
import { auth } from "../../../lib/auth";
import { appUrl } from "../../../lib/config";
import { readJson, HttpError } from "../../../lib/http";
import { consumeLimit } from "../../../lib/rate-limit";
import { drainMailQueue, mailEnabled } from "../../../lib/mail";
import { z } from "zod";
export async function POST(req: NextRequest) {
  const json = (body: unknown, status = 200) =>
    NextResponse.json(body, {
      status,
      headers: {
        "Cache-Control": "no-store",
        "Referrer-Policy": "no-referrer",
      },
    });
  try {
    if (req.headers.get("origin") !== new URL(appUrl() || req.url).origin)
      throw new HttpError(403, "Invalid request origin");
    const { email } = z
      .object({ email: z.string().trim().toLowerCase().email().max(254) })
      .strict()
      .parse(await readJson(req, 1000));
    if (!mailEnabled())
      throw new HttpError(
        503,
        "Email delivery is not configured. Contact the workspace owner.",
      );
    if (!(await consumeLimit("recovery:global", 30)))
      throw new HttpError(429, "Too many requests. Try again in a minute.");
    await auth.api.requestPasswordReset({
      body: { email },
      headers: req.headers,
    });
    after(async () => {
      await drainMailQueue();
    });
    return json({
      message:
        "If an account matches that address, a reset email will be sent.",
    });
  } catch (e) {
    return json(
      {
        error:
          e instanceof HttpError
            ? e.message
            : e instanceof z.ZodError
              ? "Enter a valid email address."
              : "Recovery is temporarily unavailable. Please retry.",
      },
      e instanceof HttpError ? e.status : e instanceof z.ZodError ? 400 : 503,
    );
  }
}
