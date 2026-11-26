import Link from "@/components/localized-link";
import { requireSession } from "@/lib/data";
import { consultationsSchema, consultationTime } from "@/lib/consultations";
import {
  AvailabilityForm,
  BookingForm,
  CancelBooking,
} from "@/components/consultation-forms";
import { StaffActionForm } from "@/components/staff-action-form";
import { saveSlot } from "./actions";
export const metadata = { title: "Consultations" };
export default async function ConsultationsPage({
  searchParams,
}: {
  searchParams: Promise<{ distributor?: string }>;
}) {
  const { client } = await requireSession();
  const { distributor } = await searchParams;
  const code =
    distributor && /^[A-Za-z0-9-]{3,40}$/.test(distributor)
      ? distributor
      : null;
  const { data, error } = await client.rpc("consultations", { p_code: code });
  const result = consultationsSchema.safeParse(data);
  if (error || !result.success)
    return (
      <div className="notice">
        Consultations are unavailable. Please try again later.
      </div>
    );
  const d = result.data;
  return (
    <div className="stack">
      <h2>Consultations</h2>
      <p>
        Choose an offered time for a general product or order conversation. This
        service does not provide medical advice. Booking records are visible
        only to you and the distributor. Confirmations and reminders depend on
        email delivery being available.
      </p>
      <Link href="/find-a-distributor">Find a distributor</Link>
      <form className="admin-actions">
        <label>
          Distributor code
          <input
            name="distributor"
            defaultValue={code ?? ""}
            pattern="[A-Za-z0-9-]{3,40}"
            required
            maxLength={40}
          />
        </label>
        <button className="button button-outline">View availability</button>
      </form>
      {d.ownAvailability ? (
        <>
          <AvailabilityForm />
          <h3>Your offered times</h3>
          {d.slots.map((s) => (
            <div className="panel" key={s.id}>
              <p>
                {consultationTime(s.startsAt, s.timezone)} –{" "}
                {consultationTime(s.endsAt, s.timezone)} ({s.timezone}) ·{" "}
                {s.booked ? "Booked" : s.active ? "Available" : "Withdrawn"}
              </p>
              {!s.booked && s.active && (
                <StaffActionForm action={saveSlot} submit="Withdraw this time">
                  <input type="hidden" name="id" value={s.id} />
                  <input
                    type="hidden"
                    name="startsAt"
                    value={new Date(s.startsAt).toISOString()}
                  />
                  <input
                    type="hidden"
                    name="endsAt"
                    value={new Date(s.endsAt).toISOString()}
                  />
                  <input type="hidden" name="timezone" value={s.timezone} />
                  <input type="hidden" name="active" value="off" />
                </StaffActionForm>
              )}
            </div>
          ))}
        </>
      ) : code ? (
        <div className="panel">
          <h3>{d.distributorName ?? "Distributor unavailable"}</h3>
          {d.slots.length ? (
            <BookingForm data={d} />
          ) : (
            <p>No times are currently available.</p>
          )}
        </div>
      ) : null}
      <h3>Your bookings</h3>
      {!d.bookings.length && <p>No consultations booked.</p>}
      {d.bookings.map((b) => (
        <article className="panel stack" key={b.id}>
          <h4>{b.distributorName}</h4>
          <p role="status">
            {consultationTime(b.startsAt, b.timezone)} –{" "}
            {consultationTime(b.endsAt, b.timezone)} ({b.timezone}) · {b.status}
          </p>
          <p>Booking reference: {b.id}</p>
          {b.status === "booked" && Date.parse(b.startsAt) > Date.now() && (
            <>
              {b.isCustomer && (
                <Link
                  href={`/account/consultations?distributor=${encodeURIComponent(b.distributorCode)}`}
                >
                  View this distributor’s availability
                </Link>
              )}
              {b.isCustomer &&
                code === b.distributorCode &&
                d.slots.length > 0 && <BookingForm data={d} booking={b} />}
              <CancelBooking booking={b} />
            </>
          )}
        </article>
      ))}
    </div>
  );
}
