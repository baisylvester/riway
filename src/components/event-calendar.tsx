import Link from "next/link";
import type { Market } from "@/lib/domain";
import {
  eventDateKey,
  eventMonth,
  eventZones,
  formatEventTime,
  regionalEvents,
  type EventEntry,
} from "@/lib/events";
import styles from "./event-calendar.module.css";

export function EventCalendar({
  entries,
  market,
  month,
  now = new Date(),
}: {
  entries: EventEntry[];
  market: Market;
  month?: unknown;
  now?: Date;
}) {
  const calendar = eventMonth(month, market, now);
  const today = eventDateKey(now, market);
  const events = regionalEvents(entries, market).filter((entry) =>
    eventDateKey(entry.starts_at!, market)?.startsWith(calendar.key),
  );
  const days = new Map<string, EventEntry[]>();
  for (const event of events) {
    const key = eventDateKey(event.starts_at!, market)!;
    days.set(key, [...(days.get(key) ?? []), event]);
  }
  return (
    <section
      className={`panel ${styles.calendar}`}
      aria-labelledby="event-calendar-title"
      data-calendar-month={calendar.key}
    >
      <div className={styles.heading}>
        <div>
          <span className="eyebrow">Regional calendar</span>
          <h2 id="event-calendar-title">{calendar.title}</h2>
          <p className="small muted">
            Dates and times are shown in {eventZones[market].label}.
          </p>
        </div>
        <form action="/events" method="get" className={styles.monthForm}>
          <label>
            Choose month
            <input
              name="month"
              type="month"
              min="1900-01"
              max="2100-12"
              defaultValue={calendar.key}
              required
            />
          </label>
          <button className="button button-outline">Show month</button>
        </form>
      </div>
      <nav className={styles.navigation} aria-label="Calendar month navigation">
        {calendar.previous ? (
          <Link href={`/events?month=${calendar.previous}`} rel="prev">
            ← Previous month
          </Link>
        ) : (
          <span />
        )}
        <Link href="/events">Current month</Link>
        {calendar.next ? (
          <Link href={`/events?month=${calendar.next}`} rel="next">
            Next month →
          </Link>
        ) : (
          <span />
        )}
      </nav>
      <div
        className={styles.scroll}
        role="region"
        tabIndex={0}
        aria-label={`${calendar.title} calendar, scroll to view all days`}
      >
        <table className={styles.grid}>
          <caption className={styles.caption}>
            {calendar.title} events · {eventZones[market].label}
          </caption>
          <thead>
            <tr>
              {[
                "Monday",
                "Tuesday",
                "Wednesday",
                "Thursday",
                "Friday",
                "Saturday",
                "Sunday",
              ].map((day) => (
                <th scope="col" key={day}>
                  <abbr title={day}>{day.slice(0, 3)}</abbr>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {calendar.weeks.map((week, row) => (
              <tr key={row}>
                {week.map((day, column) => (
                  <td
                    key={day ?? `empty-${column}`}
                    className={day ? undefined : styles.blank}
                  >
                    {day && (
                      <>
                        <time
                          dateTime={day}
                          aria-current={day === today ? "date" : undefined}
                          className={styles.day}
                        >
                          {Number(day.slice(8))}
                        </time>
                        {!!days.get(day)?.length && (
                          <ul aria-label={`Events on ${day}`}>
                            {days.get(day)!.map((event) => (
                              <li key={event.id}>
                                <Link href={`/events/${event.slug}`}>
                                  <span>{event.title}</span>
                                  <time dateTime={event.starts_at!}>
                                    {formatEventTime(event.starts_at!, market)}
                                  </time>
                                </Link>
                              </li>
                            ))}
                          </ul>
                        )}
                      </>
                    )}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {!events.length && (
        <p className="notice">
          No published events for this market in {calendar.title}. Upcoming
          events are listed below.
        </p>
      )}
    </section>
  );
}
