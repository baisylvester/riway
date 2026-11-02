import { failure } from "@/lib/http";
export async function POST() {
  return failure(
    "No payment gateway has been configured. No event was accepted.",
    503,
  );
}
