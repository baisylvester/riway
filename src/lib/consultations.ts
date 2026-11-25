import { z } from "zod";

export const timezoneSchema = z
  .string()
  .min(1)
  .max(80)
  .refine((value) => {
    try {
      new Intl.DateTimeFormat("en", { timeZone: value });
      return true;
    } catch {
      return false;
    }
  }, "Choose a valid timezone.");
const uuid = z.uuid();
export const slotSchema = z
  .object({
    id: uuid.nullable(),
    startsAt: z.iso.datetime({ offset: true }),
    endsAt: z.iso.datetime({ offset: true }),
    timezone: timezoneSchema,
    active: z.boolean(),
  })
  .refine(
    (v) =>
      Date.parse(v.endsAt) > Date.parse(v.startsAt) &&
      Date.parse(v.endsAt) - Date.parse(v.startsAt) <= 14400000,
    "Choose an end time after the start, within four hours.",
  );
export const bookingSchema = z
  .object({
    id: uuid.nullable(),
    slotId: uuid.nullable(),
    revision: z.number().int().nonnegative(),
    timezone: timezoneSchema,
    cancel: z.boolean(),
  })
  .refine((v) => (v.cancel ? !!v.id : !!v.slotId), "Choose an available time.");
export const consultationsSchema = z.object({
  distributorCode: z.string().nullable(),
  distributorName: z.string().nullable(),
  ownAvailability: z.boolean().nullable(),
  slots: z.array(
    z.object({
      id: uuid,
      startsAt: z.string(),
      endsAt: z.string(),
      timezone: z.string(),
      active: z.boolean(),
      booked: z.boolean(),
    }),
  ),
  bookings: z.array(
    z.object({
      id: uuid,
      revision: z.number().int(),
      status: z.enum(["booked", "cancelled"]),
      timezone: z.string(),
      startsAt: z.string(),
      endsAt: z.string(),
      distributorCode: z.string(),
      distributorName: z.string(),
      isCustomer: z.boolean(),
    }),
  ),
});
export type Consultations = z.infer<typeof consultationsSchema>;
export function consultationTime(value: string, timezone: string) {
  return new Intl.DateTimeFormat("en", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: timezone,
  }).format(new Date(value));
}
export function consultationProblem(code?: string) {
  if (code === "42501")
    return "Sign in with an authorized account. Distributor availability requires an active verified profile.";
  if (code === "40001")
    return "This booking changed. Reload before continuing.";
  if (code === "23P01" || code === "23505")
    return "That time is no longer available or overlaps another appointment. Choose another time.";
  if (code === "22023" || code === "23514")
    return "Check the time, timezone and current booking status. Started or booked availability cannot be edited.";
  return "The consultation could not be saved. Reload to check its status before trying again.";
}
