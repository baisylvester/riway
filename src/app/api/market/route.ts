import { NextResponse } from "next/server";
import { marketSchema } from "@/lib/domain";
import { failure, sameOrigin } from "@/lib/http";
export async function POST(request: Request) {
  if (!sameOrigin(request)) return failure("Invalid request origin", 403);
  const parsed = marketSchema.safeParse(
    (await request.json().catch(() => null))?.market,
  );
  if (!parsed.success) return failure("Invalid market");
  const r = NextResponse.json({ market: parsed.data });
  r.cookies.set("riway-market", parsed.data, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 31536000,
  });
  return r;
}
