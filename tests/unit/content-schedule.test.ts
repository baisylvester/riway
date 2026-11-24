import { describe, expect, it } from "vitest";
import {
  contentImageSchema,
  contentScheduleSchema,
  isLive,
  isoToUtcInput,
  scheduleState,
  utcInputToIso,
} from "@/lib/content-schedule";

const now = new Date("2026-11-24T12:00:00Z");
const published = { status: "published" };

describe("scheduleState", () => {
  it("is live only inside the approved window", () => {
    expect(scheduleState(published, now)).toBe("live");
    expect(
      scheduleState({ ...published, publish_at: "2026-11-24T12:00:00Z" }, now),
    ).toBe("live");
    expect(
      scheduleState({ ...published, publish_at: "2026-11-24T12:00:01Z" }, now),
    ).toBe("scheduled");
    expect(
      scheduleState(
        { ...published, unpublish_at: "2026-11-24T12:00:00Z" },
        now,
      ),
    ).toBe("ended");
    expect(
      isLive(
        {
          ...published,
          publish_at: "2026-11-24T11:00:00Z",
          unpublish_at: "2026-11-24T13:00:00Z",
        },
        now,
      ),
    ).toBe(true);
  });
  it("never treats unapproved entries as live, even inside a window", () => {
    for (const status of ["draft", "review", "archived"])
      expect(isLive({ status, publish_at: "2026-11-01T00:00:00Z" }, now)).toBe(
        false,
      );
    expect(isLive({}, now)).toBe(false);
  });
});

describe("schedule inputs", () => {
  it("round-trips UTC datetime-local values", () => {
    expect(utcInputToIso("2026-12-01T08:30")).toBe("2026-12-01T08:30:00.000Z");
    expect(utcInputToIso("")).toBeNull();
    expect(isoToUtcInput("2026-12-01T08:30:00+00:00")).toBe("2026-12-01T08:30");
    expect(isoToUtcInput(null)).toBe("");
    expect(isoToUtcInput("not a date")).toBe("");
  });
  it("requires the end after the start", () => {
    expect(
      contentScheduleSchema.safeParse({
        publish_at: "2026-12-01T08:30",
        unpublish_at: "2026-12-01T08:30",
      }).success,
    ).toBe(false);
    expect(
      contentScheduleSchema.safeParse({
        publish_at: "2026-12-01T08:30",
        unpublish_at: "2026-12-02T08:30",
      }).success,
    ).toBe(true);
    expect(
      contentScheduleSchema.safeParse({ publish_at: "", unpublish_at: "" })
        .success,
    ).toBe(true);
    expect(
      contentScheduleSchema.safeParse({
        publish_at: "2026-02-30T08:30",
        unpublish_at: "",
      }).success,
    ).toBe(false);
  });
});

describe("contentImageSchema", () => {
  const id = "0d9f6a3e-1c2b-4d5e-8f70-112233445566";
  it("accepts only published editorial images or bundled assets", () => {
    for (const ok of [
      "",
      `https://skiimthwadramxdzhgoy.supabase.co/storage/v1/object/public/editorial-public/PH/${id}.png`,
      "/design/conscientious/collection.jpg",
    ])
      expect(contentImageSchema.safeParse(ok).success).toBe(true);
    for (const bad of [
      "https://evil.example/x.png",
      `https://x.supabase.co/storage/v1/object/public/editorial-media/PH/${id}.png`,
      `https://x.supabase.co/storage/v1/object/public/editorial-public/XX/${id}.png`,
      `http://x.supabase.co/storage/v1/object/public/editorial-public/PH/${id}.png`,
      "/design/../secret.png",
      "javascript:alert(1)",
      "//evil.example/design/x.png",
    ])
      expect(contentImageSchema.safeParse(bad).success).toBe(false);
  });
});
