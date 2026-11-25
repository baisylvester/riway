import { z } from "zod";
export const eventAttendanceSchema = z.object({
  eventId: z.uuid(),
  title: z.string(),
  startsAt: z.string().nullable(),
  capacity: z.number().int().nullable(),
  rulesRevision: z.number().int(),
  registered: z.number().int(),
  page: z.number().int(),
  total: z.number().int(),
  attendees: z.array(
    z.object({
      id: z.uuid(),
      status: z.enum(["registered", "cancelled"]),
      revision: z.number().int(),
      checkedInAt: z.string().nullable(),
      createdAt: z.string(),
      name: z.string(),
    }),
  ),
});
