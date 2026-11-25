import { beforeEach, afterEach, describe, it, expect, vi } from "vitest";
vi.mock("server-only", () => ({}));
import {
  assistantConfiguration,
  chooseApprovedSources,
  transcribeAssistantAudio,
} from "@/services/approved-content-assistant";
import { selectCandidates, restrictedQuestion } from "@/lib/product-assistant";
const sources = [
  {
    id: "source-a",
    title: "Package labels",
    text: "Use the approved package label for directions.",
    url: "/support",
    approvedAt: "2026-11-25T00:00:00Z",
  },
];
beforeEach(() => {
  vi.stubEnv("AI_ASSISTANT_PROVIDER", "openai");
  vi.stubEnv("OPENAI_API_KEY", "fixture-only");
  vi.stubEnv("AI_ASSISTANT_MODEL", "fixture-model");
  vi.stubEnv("AI_PROVIDER_APPROVAL_REFERENCE", "QA-APPROVAL");
  vi.stubEnv("AI_DATA_SHARING_DISABLED", "true");
});
afterEach(() => vi.unstubAllEnvs());
const response = (sourceIds: string[], handoff = false, status = "completed") =>
  Response.json({
    status,
    output: [
      {
        type: "message",
        content: [
          { type: "output_text", text: JSON.stringify({ sourceIds, handoff }) },
        ],
      },
    ],
  });
describe("approved-content assistant", () => {
  it("fails closed before any network call without approved configuration", async () => {
    vi.stubEnv("AI_DATA_SHARING_DISABLED", "false");
    const fetcher = vi.fn();
    expect(assistantConfiguration().enabled).toBe(false);
    await expect(
      chooseApprovedSources(sources, ["package"], fetcher),
    ).rejects.toThrow();
    expect(fetcher).not.toHaveBeenCalled();
  });
  it("sends no free-text customer question, private order or stored conversation to the selection model", async () => {
    const c = selectCandidates(
      "My email is private@example.invalid and order ABC123; package labels?",
      sources,
    );
    expect(c.terms).toEqual(["package", "labels"]);
    const fetcher = vi.fn().mockResolvedValue(response([c.sources[0].id]));
    const result = await chooseApprovedSources(c.sources, c.terms, fetcher);
    const body = JSON.parse(fetcher.mock.calls[0][1].body);
    expect(body.store).toBe(false);
    expect(body.text.format.strict).toBe(true);
    expect(JSON.stringify(body)).not.toContain("private@example.invalid");
    expect(JSON.stringify(body)).not.toContain("ABC123");
    expect(result[0].text).toBe(sources[0].text);
  });
  it("never returns invented source IDs, incomplete replies or arbitrary generated prose", async () => {
    await expect(
      chooseApprovedSources(
        sources,
        ["package"],
        vi.fn().mockResolvedValue(response(["invented"])),
      ),
    ).rejects.toThrow("Unapproved");
    await expect(
      chooseApprovedSources(
        sources,
        ["package"],
        vi.fn().mockResolvedValue(response(["source-a"], false, "incomplete")),
      ),
    ).rejects.toThrow("Incomplete");
    expect(
      await chooseApprovedSources(
        sources,
        ["package"],
        vi.fn().mockResolvedValue(response(["source-a"], true)),
      ),
    ).toEqual([]);
  });
  it("refuses health advice and unsupported requests instead of generating claims", () => {
    for (const q of [
      "Does it cure cancer?",
      "Can I take this while pregnant?",
      "治疗糖尿病",
      "ubat penyakit",
      "gamot sa sakit",
    ]) {
      expect(restrictedQuestion(q), q).toBe(true);
    }
    expect(selectCandidates("unrelated information", sources).sources).toEqual(
      [],
    );
  });
  it("requires separate voice setup and validates transcription output", async () => {
    const file = new File(
      [new Uint8Array([0x1a, 0x45, 0xdf, 0xa3])],
      "question.webm",
      { type: "audio/webm" },
    );
    await expect(transcribeAssistantAudio(file, vi.fn())).rejects.toThrow();
    vi.stubEnv("AI_VOICE_ENABLED", "true");
    vi.stubEnv("AI_TRANSCRIPTION_MODEL", "fixture-transcribe");
    const f = vi
      .fn()
      .mockResolvedValue(Response.json({ text: "Package label directions" }));
    expect(await transcribeAssistantAudio(file, f)).toBe(
      "Package label directions",
    );
    expect(f.mock.calls[0][0]).toBe(
      "https://api.openai.com/v1/audio/transcriptions",
    );
  });
});
