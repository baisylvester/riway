import { session } from "@/lib/data";
import { sameOrigin, failure } from "@/lib/http";
import {
  assistantConfiguration,
  transcribeAssistantAudio,
} from "@/services/approved-content-assistant";
export async function POST(request: Request) {
  if (!sameOrigin(request)) return failure("Invalid request origin.", 403);
  const { client, user } = await session();
  if (!user) return failure("Sign in required.", 401);
  if (!assistantConfiguration().voice)
    return failure("Voice assistance is unavailable.", 503);
  if (request.headers.get("x-riway-voice-consent") !== "yes")
    return failure("Voice processing consent is required.", 400);
  if (!request.headers.get("content-type")?.startsWith("audio/webm"))
    return failure("WebM audio required.", 415);
  const declared = Number(request.headers.get("content-length") || 0);
  if (declared > 2000000) return failure("Recording is too large.", 413);
  const reader = request.body?.getReader();
  if (!reader) return failure("Recording required.");
  const parts: Uint8Array[] = [];
  let total = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.length;
    if (total > 2000000) {
      await reader.cancel();
      return failure("Recording is too large.", 413);
    }
    parts.push(value);
  }
  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const p of parts) {
    bytes.set(p, offset);
    offset += p.length;
  }
  if (
    total < 4 ||
    bytes[0] !== 0x1a ||
    bytes[1] !== 0x45 ||
    bytes[2] !== 0xdf ||
    bytes[3] !== 0xa3
  )
    return failure("Invalid audio recording.");
  const rate = await client.rpc("assistant_voice_rate");
  if (rate.error)
    return failure("Voice request limit reached. Please try later.", 429);
  try {
    return Response.json(
      {
        text: await transcribeAssistantAudio(
          new File([bytes], "question.webm", { type: "audio/webm" }),
        ),
      },
      { headers: { "Cache-Control": "private, no-store" } },
    );
  } catch {
    return failure(
      "The recording could not be transcribed. Please type your question.",
      503,
    );
  }
}
