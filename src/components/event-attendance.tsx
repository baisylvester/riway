import { StaffActionForm } from "./staff-action-form";
import Link from "next/link";
import {
  changeEventAttendance,
  saveEventAdmission,
} from "@/app/admin/events/actions";
import type { z } from "zod";
import type { eventAttendanceSchema } from "@/lib/event-attendance";
export function EventAttendees({
  data,
  staff = false,
}: {
  data: z.infer<typeof eventAttendanceSchema>;
  staff?: boolean;
}) {
  return (
    <div className="stack">
      <p>
        {data.registered} registered
        {data.capacity !== null ? ` / ${data.capacity} places` : ""}
      </p>
      {staff && (
        <StaffActionForm action={saveEventAdmission} submit="Approve capacity">
          <input type="hidden" name="id" value={data.eventId} />
          <input type="hidden" name="revision" value={data.rulesRevision} />
          <label>
            Capacity
            <input
              name="capacity"
              type="number"
              min={Math.max(1, data.registered)}
              max={100000}
              required
              defaultValue={data.capacity ?? ""}
            />
          </label>
          <label>
            Approval reference
            <input name="reference" minLength={3} maxLength={120} required />
          </label>
        </StaffActionForm>
      )}
      {data.attendees.map((a) => (
        <article className="panel stack" key={a.id}>
          <p>
            {a.name} · {a.status}
            {a.checkedInAt ? " · Checked in" : ""}
          </p>
          <p>Registration reference: {a.id}</p>
          {a.status === "registered" && !a.checkedInAt && (
            <StaffActionForm
              action={changeEventAttendance}
              submit={staff ? "Check in attendee" : "Cancel registration"}
            >
              <input type="hidden" name="id" value={a.id} />
              <input type="hidden" name="revision" value={a.revision} />
              {staff && <input type="hidden" name="checkIn" value="on" />}
              <label className="check">
                <input name="confirmed" type="checkbox" required />
                {staff
                  ? "I verified this attendee’s registration."
                  : "I confirm cancellation."}
              </label>
            </StaffActionForm>
          )}
        </article>
      ))}
      {staff && (
        <nav aria-label="Attendee pages">
          {data.page > 0 && (
            <Link
              href={`/admin/events?event=${data.eventId}&page=${data.page - 1}`}
            >
              Previous attendees
            </Link>
          )}
          {(data.page + 1) * 25 < data.total && (
            <Link
              href={`/admin/events?event=${data.eventId}&page=${data.page + 1}`}
            >
              Next attendees
            </Link>
          )}
        </nav>
      )}
    </div>
  );
}
