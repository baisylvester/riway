import { NextResponse } from "next/server";
import { session } from "@/lib/data";
import { failure, sameOrigin } from "@/lib/http";
import { completePendingReferral } from "@/lib/referral-continuity";

export async function POST(request: Request) {
  if (!sameOrigin(request)) return failure("Invalid request origin", 403);
  try {
    const { client, user } = await session();
    if (!user) return failure("Sign in to link your saved introduction.", 401);
    return NextResponse.json(await completePendingReferral(client), {
      headers: { "Cache-Control": "private, no-store" },
    });
  } catch {
    return failure(
      "Your saved introduction could not be linked. Please retry. It has been kept for another attempt.",
      503,
    );
  }
}
