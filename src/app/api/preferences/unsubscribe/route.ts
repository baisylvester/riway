import { z } from "zod";
import { db } from "@/lib/supabase/server";
const headers = {
  "Content-Type": "text/html; charset=utf-8",
  "Cache-Control": "private, no-store",
  "Referrer-Policy": "no-referrer",
  "Content-Security-Policy":
    "default-src 'none'; form-action 'self'; frame-ancestors 'none'; base-uri 'none'",
  "X-Content-Type-Options": "nosniff",
};
function token(request: Request) {
  return z.uuid().safeParse(new URL(request.url).searchParams.get("token"));
}
export async function GET(request: Request) {
  const t = token(request);
  if (!t.success)
    return new Response("Invalid unsubscribe link.", { status: 400, headers });
  return new Response(
    `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>Stop RIWAY reorder reminders</title><h1>Stop reorder emails</h1><p>This stops optional reorder reminders. Order and account messages continue.</p><form method="post"><button>Unsubscribe from reorder reminders</button></form></html>`,
    { headers },
  );
}
export async function POST(request: Request) {
  const t = token(request);
  if (!t.success)
    return new Response("Invalid unsubscribe link.", { status: 400, headers });
  const { error } = await (
    await db()
  ).rpc("unsubscribe_reorder", { p_token: t.data });
  return new Response(
    error
      ? "Your request could not be confirmed. Please try again or update your account preferences."
      : "Reorder reminders have been stopped for this link. Order and account messages continue.",
    { status: error ? 503 : 200, headers },
  );
}
