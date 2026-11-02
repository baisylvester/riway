import { NextResponse } from "next/server";
export function failure(message: string, status = 400) {
  return NextResponse.json(
    { error: { message } },
    { status, headers: { "Cache-Control": "no-store" } },
  );
}
export function sameOrigin(request: Request) {
  const origin = request.headers.get("origin");
  if (!origin || request.headers.get("sec-fetch-site") === "cross-site")
    return false;
  try {
    const received = new URL(request.url);
    // Next.js can normalize request.url to localhost behind its internal server.
    // Host is the actual incoming authority; browser scripts cannot spoof it.
    const authority = request.headers.get("host") ?? received.host;
    return origin === `${received.protocol}//${authority}`;
  } catch {
    return false;
  }
}
