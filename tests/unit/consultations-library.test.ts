import { describe, it, expect, vi } from "vitest";
vi.mock("server-only", () => ({}));
import {
  slotSchema,
  bookingSchema,
  consultationTime,
} from "@/lib/consultations";
import { libraryContentSchema, libraryQuery } from "@/lib/content-library";
import { notificationContent } from "@/services/resend-email";
const id = "60000000-0000-4000-8000-000000000001";
describe("consultation and library boundaries", () => {
  it("rejects invalid times/timezones and missing booking targets", () => {
    const s = {
      id: null,
      startsAt: "2026-12-01T10:00:00Z",
      endsAt: "2026-12-01T11:00:00Z",
      timezone: "Asia/Manila",
      active: true,
    };
    expect(slotSchema.safeParse(s).success).toBe(true);
    expect(slotSchema.safeParse({ ...s, endsAt: s.startsAt }).success).toBe(
      false,
    );
    expect(
      slotSchema.safeParse({ ...s, timezone: "Invalid/Zone" }).success,
    ).toBe(false);
    expect(
      bookingSchema.safeParse({
        id: null,
        slotId: null,
        revision: 0,
        timezone: "UTC",
        cancel: false,
      }).success,
    ).toBe(false);
    expect(consultationTime(s.startsAt, s.timezone)).toContain("6:00");
  });
  it("requires transcripts and refuses unsafe source URLs", () => {
    const a = {
      title: "Approved film",
      description: "",
      campaign: "",
      locale: "en",
      mediaType: "video",
      url: "https://vimeo.com/123",
      transcript: "Accessible transcript",
      disclaimer: "",
    };
    expect(libraryContentSchema.safeParse(a).success).toBe(true);
    for (const url of [
      "javascript:alert(1)",
      "//evil.com/a",
      "https://riway.com.evil.com/a",
      "https://riway.com@evil.com/a",
      "/../admin",
      "/images/%2e%2e/admin",
    ])
      expect(libraryContentSchema.safeParse({ ...a, url }).success, url).toBe(
        false,
      );
    expect(
      libraryContentSchema.safeParse({ ...a, transcript: "" }).success,
    ).toBe(false);
  });
  it("bounds query inputs", () => {
    expect(
      libraryQuery({
        page: "-1",
        type: "script",
        locale: "<script>",
        q: "a".repeat(200),
      }),
    ).toEqual({ page: 0, type: null, locale: null, search: "a".repeat(120) });
  });
  it("renders private sign-in links and escaped content in booking email", () => {
    process.env.NEXT_PUBLIC_SITE_URL = "https://example.invalid";
    const m = notificationContent({
      type: "consultation_update",
      reference: id,
      context: {
        bookingId: id,
        revision: 1,
        status: "cancelled",
        startsAt: "2026-12-01T10:00:00Z",
        timezone: "UTC",
      },
    });
    expect(m.text).toContain("/account/consultations");
    expect(m.subject).toContain("cancelled");
    expect(m.text).not.toContain("medical advice");
  });
});
