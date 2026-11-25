import Link from "next/link";
import { z } from "zod";
import { session, currentMarket } from "@/lib/data";
import { eventAttendanceSchema } from "@/lib/event-attendance";
import { EventAttendees } from "@/components/event-attendance";
export const metadata = { title: "Event attendance" };
export default async function EventAdmin({
  searchParams,
}: {
  searchParams: Promise<{ event?: string; page?: string; eventsPage?: string }>;
}) {
  const { client } = await session();
  const market = await currentMarket();
  const q = await searchParams;
  const page = (v?: string) => {
    const n = Number(v ?? 0);
    return Number.isInteger(n) && n >= 0 && n <= 10000 ? n : 0;
  };
  const eventPage = page(q.eventsPage),
    attendeePage = page(q.page);
  const selected = z.uuid().safeParse(q.event);
  let query = client
    .from("content_entries")
    .select("id,title,starts_at")
    .eq("kind", "event")
    .or(`market.eq.${market},market.is.null`)
    .order("starts_at", { ascending: false })
    .order("id");
  if (selected.success) query = query.eq("id", selected.data);
  const { data, error } = await query.range(
    selected.success ? 0 : eventPage * 25,
    selected.success ? 0 : eventPage * 25 + 24,
  );
  return (
    <div className="stack">
      <h1>Event attendance</h1>
      <p>
        Capacity approvals require market administrator or compliance access.
        Check-in requires administrator or operations access. Attendees are
        shown in pages of 25.
      </p>
      {selected.success && <Link href="/admin/events">All events</Link>}
      {error ? (
        <p>Events could not be loaded.</p>
      ) : (
        await Promise.all(
          (data ?? []).map(async (e) => {
            const r = await client.rpc("event_attendance", {
              p_event: e.id,
              p_staff: true,
              p_page: selected.success ? attendeePage : 0,
            });
            const p = eventAttendanceSchema.safeParse(r.data);
            return (
              <details key={e.id} className="panel" open={selected.success}>
                <summary>{e.title}</summary>
                {!r.error && p.success ? (
                  <EventAttendees data={p.data} staff />
                ) : (
                  <p>Attendance unavailable for your role.</p>
                )}
              </details>
            );
          }),
        )
      )}
      {!selected.success && (
        <nav aria-label="Event pages">
          {eventPage > 0 && (
            <Link href={`?eventsPage=${eventPage - 1}`}>Previous events</Link>
          )}
          {data?.length === 25 && (
            <Link href={`?eventsPage=${eventPage + 1}`}>Next events</Link>
          )}
        </nav>
      )}
    </div>
  );
}
