import { NextResponse } from "next/server";
import { db } from "@/lib/supabase/server";
import { stripeReadiness } from "@/lib/stripe-config";
import { xenditReadiness } from "@/lib/xendit-config";
export const dynamic = "force-dynamic";
export async function GET() {
  try {
    const { error } = await (
      await db()
    )
      .from("markets")
      .select("code")
      .limit(1)
      .abortSignal(AbortSignal.timeout(3000));
    if (error) throw error;
    const readiness = stripeReadiness();
    const xendit = xenditReadiness();
    return NextResponse.json(
      {
        status: "ok",
        version: "0.1.0",
        commerce: readiness.enabled || xendit.enabled ? "gated" : "disabled",
        payments: readiness.mode,
        xendit: xendit.mode,
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch {
    return NextResponse.json(
      { status: "unavailable" },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }
}
