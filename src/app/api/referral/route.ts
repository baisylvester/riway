import { session } from "@/lib/data";
import { failure, sameOrigin } from "@/lib/http";
import { z } from "zod";
export async function POST(request: Request) {
  if (!sameOrigin(request)) return failure("Invalid request origin", 403);
  const { client, user } = await session();
  if (!user) return failure("Sign in to link this distributor.", 401);
  const input = z
    .object({ code: z.string().regex(/^[A-Za-z0-9-]{3,40}$/) })
    .safeParse(await request.json().catch(() => null));
  if (!input.success) return failure("Invalid distributor code.");
  const { data, error } = await client.rpc("claim_referral", {
    c: input.data.code,
  });
  return error
    ? failure(
        "Your existing sponsor remains unchanged. Check this introduction.",
      )
    : Response.json({ message: String(data) });
}
