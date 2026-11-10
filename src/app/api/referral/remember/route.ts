import { z } from "zod";
import { NextResponse } from "next/server";
import { session } from "@/lib/data";
import { failure, sameOrigin } from "@/lib/http";
import { limitedText } from "@/lib/request-body";
import {
  clearPendingReferral,
  rememberReferral,
} from "@/lib/referral-continuity";

export async function POST(request: Request) {
  if (!sameOrigin(request)) return failure("Invalid request origin", 403);
  const input = z
    .object({ code: z.string().regex(/^[A-Za-z0-9-]{3,40}$/) })
    .safeParse(
      await limitedText(request, 1024)
        .then(JSON.parse)
        .catch(() => null),
    );
  if (!input.success) return failure("Invalid distributor code.");
  try {
    const { client, user } = await session();
    const result = await rememberReferral(client, input.data.code);
    if (!result)
      return failure("This verified distributor is not available.", 404);
    return NextResponse.json(
      { ...result, canLink: !!user },
      { headers: { "Cache-Control": "private, no-store" } },
    );
  } catch {
    return failure(
      "Your introduction could not be saved. Please try again.",
      503,
    );
  }
}

export async function DELETE(request: Request) {
  if (!sameOrigin(request)) return failure("Invalid request origin", 403);
  await clearPendingReferral();
  return NextResponse.json(
    {
      state: "cleared",
      message:
        "The saved introduction on this browser has been cleared. An account sponsor already linked remains unchanged.",
    },
    { headers: { "Cache-Control": "private, no-store" } },
  );
}
