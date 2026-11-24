import { z } from "zod";
import { eventDateSchema } from "./domain";

// Scheduled publication for CMS entries. The database read policy already
// hides approved entries outside their window from the public; staff sessions
// can read every entry in their market, so public pages filter again here.

export type Schedulable = {
  status?: string | null;
  publish_at?: string | null;
  unpublish_at?: string | null;
};

export type ScheduleState =
  "draft" | "review" | "archived" | "scheduled" | "live" | "ended";

const at = (value: string | null | undefined) =>
  value ? Date.parse(value) : Number.NaN;

export function scheduleState(
  entry: Schedulable,
  now: Date = new Date(),
): ScheduleState {
  if (entry.status !== "published")
    return (entry.status as ScheduleState) ?? "draft";
  const t = now.getTime();
  if (at(entry.publish_at) > t) return "scheduled";
  if (at(entry.unpublish_at) <= t) return "ended";
  return "live";
}

export const isLive = (entry: Schedulable, now: Date = new Date()) =>
  scheduleState(entry, now) === "live";

export const scheduleLabels: Record<ScheduleState, string> = {
  draft: "Draft",
  review: "In review",
  archived: "Archived",
  scheduled: "Approved, scheduled",
  live: "Live",
  ended: "Ended",
};

/** "YYYY-MM-DDTHH:MM" (UTC, from a datetime-local input) to ISO, or null. */
export function utcInputToIso(value: string): string | null {
  return value ? new Date(value + "Z").toISOString() : null;
}

/** ISO timestamp to the "YYYY-MM-DDTHH:MM" UTC value a datetime-local input expects. */
export function isoToUtcInput(value: string | null | undefined): string {
  if (!value) return "";
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? "" : d.toISOString().slice(0, 16);
}

// Content images: a published editorial image (public bucket) or a bundled
// /design asset. The database trigger rechecks market and publication.
export const publicMediaUrlPattern =
  /^https:\/\/[a-z0-9.-]+(:[0-9]+)?\/storage\/v1\/object\/public\/editorial-public\/(PH|SG|MY)\/[0-9a-f-]{36}\.(png|jpg|webp)$/;
export const bundledImagePattern =
  /^\/design\/([A-Za-z0-9_-]+\/)*[A-Za-z0-9_-]+\.(png|jpg|jpeg|webp)$/;

export const contentImageSchema = z.union([
  z.literal(""),
  z
    .string()
    .max(500)
    .refine(
      (v) => publicMediaUrlPattern.test(v) || bundledImagePattern.test(v),
      "Choose a published editorial image.",
    ),
]);

export const contentScheduleSchema = z
  .object({
    publish_at: eventDateSchema,
    unpublish_at: eventDateSchema,
  })
  .refine(
    (v) =>
      !v.publish_at ||
      !v.unpublish_at ||
      Date.parse(v.unpublish_at + "Z") > Date.parse(v.publish_at + "Z"),
    { message: "The end must be after the start.", path: ["unpublish_at"] },
  );
