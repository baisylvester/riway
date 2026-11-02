import { NextResponse } from "next/server";
import { cartSchema } from "@/lib/domain";
import { session } from "@/lib/data";
import { failure, sameOrigin } from "@/lib/http";
export async function GET() {
  const { client, user } = await session();
  if (!user) return failure("Sign in to retrieve your saved bag.", 401);
  const { data, error } = await client
    .from("carts")
    .select("items")
    .eq("user_id", user.id)
    .maybeSingle();
  return error
    ? failure("Could not retrieve your bag.", 503)
    : NextResponse.json(
        { items: data?.items ?? [] },
        { headers: { "Cache-Control": "no-store" } },
      );
}
export async function PUT(request: Request) {
  if (!sameOrigin(request)) return failure("Invalid request origin", 403);
  const { client, user } = await session();
  if (!user) return failure("Sign in to save your bag.", 401);
  const parsed = cartSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return failure("Invalid bag quantities.");
  const { error } = await client.from("carts").upsert({
    user_id: user.id,
    items: parsed.data,
    updated_at: new Date().toISOString(),
  });
  return error
    ? failure("Could not save your bag.", 503)
    : NextResponse.json({ saved: true });
}
