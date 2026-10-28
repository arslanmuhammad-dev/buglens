import { after, NextRequest, NextResponse } from "next/server";
import { mailEnabled, drainMailQueue } from "../../../../lib/mail";
import { auth } from "../../../../lib/auth";
import { toNextJsHandler } from "better-auth/next-js";
const handler = toNextJsHandler(auth);
export const GET = handler.GET;
export async function POST(req: NextRequest) {
  if (
    req.nextUrl.pathname.endsWith("/request-password-reset") &&
    !mailEnabled()
  )
    return NextResponse.json(
      {
        error: "Email delivery is not configured. Contact the workspace owner.",
      },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  const response = await handler.POST(req);
  if (mailEnabled())
    after(async () => {
      await drainMailQueue();
    });
  return response;
}
