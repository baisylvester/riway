import { it, expect } from "vitest";
import { eventDateSchema } from "../../src/lib/domain";
it("accepts UTC event dates and an intentionally empty date", () => {
  expect(eventDateSchema.safeParse("2027-01-09T19:30").success).toBe(true);
  expect(eventDateSchema.safeParse("").success).toBe(true);
});
it("rejects impossible dates and unexpected timezone inputs", () => {
  for (const value of [
    "2026-02-30T19:30",
    "2026-13-01T10:00",
    "not-a-date",
    "2027-01-09T19:30+08:00",
  ])
    expect(eventDateSchema.safeParse(value).success).toBe(false);
});
