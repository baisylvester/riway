import { checkoutSchema } from "@/lib/domain";
import { failure, sameOrigin } from "@/lib/http";
import { session } from "@/lib/data";
export async function POST(request: Request) {
  if (!sameOrigin(request)) return failure("Invalid request origin", 403);
  const input = checkoutSchema.safeParse(
    await request.json().catch(() => null),
  );
  if (!input.success)
    return failure("Check your bag, delivery details and terms acceptance.");
  const { user } = await session();
  if (!user) return failure("Please sign in before checkout.", 401);
  // Do not reserve stock or create payable orders until a real hosted gateway is integrated.
  return failure(
    "Online ordering is unavailable. RIWAY policy approval, product registration, approved pricing and payment integration are required.",
    409,
  );
}
