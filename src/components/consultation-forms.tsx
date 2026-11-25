"use client";
import { useState, useEffect, useActionState } from "react";
import { saveSlot, changeBooking } from "@/app/account/consultations/actions";
import { consultationTime, type Consultations } from "@/lib/consultations";
import { StaffActionForm } from "./staff-action-form";
export function AvailabilityForm() {
  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");
  const [zone, setZone] = useState("UTC");
  const [state, action, pending] = useActionState(saveSlot, { message: "" });
  useEffect(() => {
    setZone(Intl.DateTimeFormat().resolvedOptions().timeZone);
  }, []);
  const iso = (v: string) =>
    v && !Number.isNaN(new Date(v).getTime()) ? new Date(v).toISOString() : "";
  return (
    <form action={action} className="panel stack" aria-busy={pending}>
      <h2>Offer a consultation time</h2>
      <p>
        Enter times in your device timezone ({zone}). Appointments are general
        product or order conversations. Do not request medical or sensitive
        health information.
      </p>
      <label>
        Start
        <input
          type="datetime-local"
          required
          value={start}
          onChange={(e) => setStart(e.target.value)}
        />
      </label>
      <label>
        End
        <input
          type="datetime-local"
          required
          value={end}
          onChange={(e) => setEnd(e.target.value)}
        />
      </label>
      <input type="hidden" name="startsAt" value={iso(start)} />
      <input type="hidden" name="endsAt" value={iso(end)} />
      <input type="hidden" name="timezone" value={zone} />
      <button className="button" disabled={pending}>
        {pending ? "Saving…" : "Offer this time"}
      </button>
      <p role="status">{state.message}</p>
    </form>
  );
}
export function BookingForm({
  data,
  booking,
}: {
  data: Consultations;
  booking?: Consultations["bookings"][number];
}) {
  const [zone, setZone] = useState("UTC");
  useEffect(() => {
    setZone(Intl.DateTimeFormat().resolvedOptions().timeZone);
  }, []);
  return (
    <StaffActionForm
      action={changeBooking}
      submit={booking ? "Reschedule consultation" : "Book consultation"}
    >
      {booking && (
        <>
          <input type="hidden" name="id" value={booking.id} />
          <input type="hidden" name="revision" value={booking.revision} />
        </>
      )}
      <input type="hidden" name="timezone" value={zone} />
      <label>
        {booking ? "New time" : "Available time"} ({zone})
        <select name="slotId" required defaultValue="">
          <option value="" disabled>
            Choose a time
          </option>
          {data.slots
            .filter((s) => s.active && !s.booked)
            .map((s) => (
              <option key={s.id} value={s.id}>
                {consultationTime(s.startsAt, zone)} –{" "}
                {consultationTime(s.endsAt, zone)}
              </option>
            ))}
        </select>
      </label>
      <label className="check">
        <input type="checkbox" name="confirmed" required />I confirm this time
        and agree to share my booking with this distributor.
      </label>
    </StaffActionForm>
  );
}
export function CancelBooking({
  booking,
}: {
  booking: Consultations["bookings"][number];
}) {
  return (
    <StaffActionForm action={changeBooking} submit="Cancel consultation">
      <input type="hidden" name="id" value={booking.id} />
      <input type="hidden" name="revision" value={booking.revision} />
      <input type="hidden" name="timezone" value={booking.timezone} />
      <input type="hidden" name="cancel" value="on" />
      <label className="check">
        <input type="checkbox" name="confirmed" required />
        Confirm cancellation
      </label>
    </StaffActionForm>
  );
}
