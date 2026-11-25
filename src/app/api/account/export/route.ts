import { session } from "@/lib/data";
import { failure } from "@/lib/http";
export async function GET() {
  const { client, user } = await session();
  if (!user) return failure("Sign in required.", 401);
  const { data, error } = await client.rpc("export_my_data");
  if (error || !data || data.subjectId !== user.id)
    return failure(
      "Export unavailable or request limit reached. Please try later or contact the privacy team.",
      503,
    );
  return new Response(JSON.stringify(data, null, 2), {
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Content-Disposition": 'attachment; filename="riway-personal-data.json"',
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
