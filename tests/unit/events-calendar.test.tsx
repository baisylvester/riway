import { createElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Market } from "../../src/lib/domain";
import {
  eventDateKey,
  eventMonth,
  eventZones,
  formatEventTime,
  regionalEvents,
  upcomingEvents,
  type EventEntry,
} from "../../src/lib/events";

const mocks = vi.hoisted(() => ({ content: vi.fn(), currentMarket: vi.fn() }));
vi.mock("../../src/lib/data", () => mocks);
vi.mock("next/navigation", () => ({
  notFound: () => {
    throw Error("NOT_FOUND");
  },
}));
vi.mock("../../src/components/brand/reference-shell", () => ({
  ReferenceShell: ({ children }: { children: ReactNode }) => children,
}));
vi.mock("../../src/components/brand/reference-stage", () => ({
  ReferenceStage: () => createElement("div", { "data-stage": "fixture" }),
}));
vi.mock("../../src/components/forms", () => ({
  EventRegistration: ({ id }: { id: string }) =>
    createElement("button", { "data-registration": id }, "Register for event"),
}));
import { EventCalendar } from "../../src/components/event-calendar";
import Events from "../../src/app/events/page";
import EventDetail from "../../src/app/events/[slug]/page";
import Home from "../../src/app/page";

const now = new Date("2026-11-10T00:00:00Z");
function event(id: string, overrides: Partial<EventEntry> = {}): EventEntry {
  return {
    id,
    slug: id,
    title: `Approved event ${id}`,
    excerpt: "A published event.",
    body: "Event details.",
    kind: "event",
    status: "published",
    market: null,
    location: "Confirmed venue",
    starts_at: "2026-11-12T10:00:00Z",
    ...overrides,
  };
}
beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers();
  vi.setSystemTime(now);
  mocks.content.mockResolvedValue([]);
  mocks.currentMarket.mockResolvedValue("PH");
});
afterEach(() => vi.useRealTimers());

describe("regional event calendar dates", () => {
  for (const market of ["PH", "SG", "MY"] as Market[]) {
    it(`${market} groups stored UTC timestamps by the displayed local day and month`, () => {
      expect(eventDateKey("2026-11-30T15:59:00Z", market)).toBe("2026-11-30");
      expect(eventDateKey("2026-11-30T16:00:00Z", market)).toBe("2026-12-01");
      expect(formatEventTime("2026-11-30T16:00:00Z", market)).toBe("00:00");
      expect(
        eventMonth(undefined, market, new Date("2026-11-30T16:00:00Z")).key,
      ).toBe("2026-12");
      const entry = event("month-boundary", {
        starts_at: "2026-11-30T16:00:00Z",
      });
      const november = renderToStaticMarkup(
        <EventCalendar
          entries={[entry]}
          market={market}
          month="2026-11"
          now={now}
        />,
      );
      const december = renderToStaticMarkup(
        <EventCalendar
          entries={[entry]}
          market={market}
          month="2026-12"
          now={now}
        />,
      );
      expect(november).not.toContain(entry.title);
      expect(december).toContain(entry.title);
      expect(december).toContain('dateTime="2026-12-01"');
      expect(december).toContain(eventZones[market].label);
    });
  }
  it("builds leap months, Monday-first weeks and bounded year transitions", () => {
    const leap = eventMonth("2028-02", "PH", now);
    expect(leap.weeks.flat().filter(Boolean)).toHaveLength(29);
    expect(leap.weeks.flat()).toContain("2028-02-29");
    expect(leap.weeks[0]).toEqual([
      null,
      "2028-02-01",
      "2028-02-02",
      "2028-02-03",
      "2028-02-04",
      "2028-02-05",
      "2028-02-06",
    ]);
    expect(
      eventMonth("2100-02", "PH", now).weeks.flat().filter(Boolean),
    ).toHaveLength(28);
    expect(eventMonth("2026-12", "PH", now).next).toBe("2027-01");
    expect(eventMonth("2027-01", "PH", now).previous).toBe("2026-12");
    expect(eventMonth("1900-01", "PH", now).previous).toBeNull();
    expect(eventMonth("2100-12", "PH", now).next).toBeNull();
  });
  it("falls back safely for malformed, repeated or out-of-range month input", () => {
    for (const value of [
      "2026-13",
      "2026-00",
      "2026-2",
      "1899-12",
      "2101-01",
      "<script>",
      ["2026-12", "2027-01"],
    ]) {
      expect(eventMonth(value, "PH", now).key).toBe("2026-11");
    }
    expect(eventDateKey("invalid", "PH")).toBeNull();
  });
  it("filters publication, market, kind, invalid dates and unsafe slugs before sorting", () => {
    const entries = [
      event("later", { starts_at: "2026-11-20T00:00:00Z" }),
      event("global"),
      event("local", { market: "PH" }),
      event("other", { market: "SG" }),
      event("draft", { status: "draft" }),
      event("review", { status: "review" }),
      event("archived", { status: "archived" }),
      event("article", { kind: "article" }),
      event("missing-date", { starts_at: null }),
      event("bad-date", { starts_at: "invalid" }),
      event("bad-slug", { slug: "../untrusted" }),
      event("past", { starts_at: "2026-11-01T00:00:00Z" }),
    ];
    expect(regionalEvents(entries, "PH").map((entry) => entry.id)).toEqual([
      "past",
      "global",
      "local",
      "later",
    ]);
    expect(upcomingEvents(entries, "PH", now).map((entry) => entry.id)).toEqual(
      ["global", "local", "later"],
    );
  });
});

describe("event page and homepage content", () => {
  it("keeps the brand homepage available when event content fails without implying an empty calendar", async () => {
    mocks.content.mockRejectedValue(Error("fixture content failure"));
    const html = renderToStaticMarkup(await Home());
    expect(html).toContain("Showing you the");
    expect(html).toContain("Event details are temporarily unavailable");
    expect(html).not.toContain("No upcoming events are currently published");
    expect(html).not.toContain("fixture content failure");
  });
  it("renders event detail links, accessible month controls and market-aware upcoming content", async () => {
    mocks.content.mockResolvedValue([
      event("local", {
        market: "PH",
        title: "Reviewed <script>title</script>",
      }),
      event("global"),
      event("other", { market: "SG" }),
      event("draft", { status: "draft" }),
    ]);
    const html = renderToStaticMarkup(
      await Events({ searchParams: Promise.resolve({ month: "2026-11" }) }),
    );
    expect(html).toContain('data-calendar-month="2026-11"');
    expect(html).toContain('href="/events/local"');
    expect(html).toContain('href="/events/global"');
    expect(html).not.toContain('href="/events/other"');
    expect(html).not.toContain('href="/events/draft"');
    expect(html).toContain("Reviewed &lt;script&gt;title&lt;/script&gt;");
    expect(html).toContain('href="/events?month=2026-10"');
    expect(html).toContain('href="/events?month=2026-12"');
    expect(html).toContain('aria-label="Calendar month navigation"');
    expect(html).toContain('aria-current="date"');
    expect(html).toContain("Upcoming events");
  });
  it("uses honest calendar and upcoming empty states without invented dates", async () => {
    const html = renderToStaticMarkup(
      await Events({ searchParams: Promise.resolve({ month: "2026-11" }) }),
    );
    expect(html).toContain("No published events for this market in");
    expect(html).toContain("The next moment is on its way.");
    expect(html).not.toContain('href="/events/');
  });
  it("homepage replaces static contact tiles with real published regional event details", async () => {
    mocks.content.mockResolvedValue([
      event("local", { market: "PH" }),
      event("global"),
      event("draft", { status: "draft" }),
      event("other", { market: "SG" }),
      event("past", { starts_at: "2026-01-01T00:00:00Z" }),
    ]);
    const html = renderToStaticMarkup(await Home());
    const section = html.slice(html.indexOf('<section class="events"'));
    expect(section).toContain('href="/events/local"');
    expect(section).toContain('href="/events/global"');
    expect(section).not.toContain('href="/events/draft"');
    expect(section).not.toContain('href="/events/other"');
    expect(section).not.toContain('href="/events/past"');
    expect(section).not.toContain('class="ev" href="#contact"');
    expect(section).not.toContain("19th Anniversary");
    expect(section).toContain('href="/events"');
  });
  it("homepage has a useful empty state when no eligible upcoming event exists", async () => {
    const html = renderToStaticMarkup(await Home());
    expect(html).toContain(
      "No upcoming events are currently published for this market.",
    );
    expect(html).toContain("View regional calendar");
  });
  it("event detail displays the selected-market timezone and keeps registration on its existing workflow", async () => {
    mocks.currentMarket.mockResolvedValue("MY");
    mocks.content.mockResolvedValue([
      event("local", { market: "MY", starts_at: "2026-11-30T16:00:00Z" }),
    ]);
    const html = renderToStaticMarkup(
      await EventDetail({ params: Promise.resolve({ slug: "local" }) }),
    );
    expect(html).toContain("1 December 2026");
    expect(html).toContain("00:00");
    expect(html).toContain("Kuala Lumpur time");
    expect(html).toContain('data-registration="local"');
  });
  it("keeps undated published details readable with registration closed", async () => {
    mocks.content.mockResolvedValue([event("undated", { starts_at: null })]);
    const html = renderToStaticMarkup(
      await EventDetail({ params: Promise.resolve({ slug: "undated" }) }),
    );
    expect(html).toContain("Date to be confirmed");
    expect(html).toContain("Registration is closed.");
    expect(html).not.toContain("data-registration=");
  });
  it("rejects missing, unpublished and other-market detail records", async () => {
    for (const entries of [
      [],
      [event("hidden", { status: "draft" })],
      [event("hidden", { market: "SG" })],
    ]) {
      mocks.content.mockResolvedValue(entries);
      await expect(
        EventDetail({ params: Promise.resolve({ slug: "hidden" }) }),
      ).rejects.toThrow("NOT_FOUND");
    }
  });
});
