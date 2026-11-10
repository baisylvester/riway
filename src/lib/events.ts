import { type Market } from "./domain";

export interface EventEntry {
  id: string;
  slug: string;
  title: string;
  excerpt: string;
  body?: string;
  kind: string;
  status: string;
  market: string | null;
  location: string | null;
  starts_at: string | null;
}

export const eventZones = {
  PH: { zone: "Asia/Manila", label: "Manila time" },
  SG: { zone: "Asia/Singapore", label: "Singapore time" },
  MY: { zone: "Asia/Kuala_Lumpur", label: "Kuala Lumpur time" },
} as const;

const dateKeyFormatters = new Map<Market, Intl.DateTimeFormat>();
const dateFormatters = new Map<Market, Intl.DateTimeFormat>();
const timeFormatters = new Map<Market, Intl.DateTimeFormat>();

export function eventDateKey(value: string | Date, market: Market) {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return null;
  if (!dateKeyFormatters.has(market)) {
    dateKeyFormatters.set(
      market,
      new Intl.DateTimeFormat("en", {
        timeZone: eventZones[market].zone,
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
      }),
    );
  }
  const parts = dateKeyFormatters.get(market)!.formatToParts(date);
  const part = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((item) => item.type === type)?.value;
  return `${part("year")}-${part("month")}-${part("day")}`;
}

export function formatEventDate(value: string, market: Market) {
  if (!dateFormatters.has(market)) {
    dateFormatters.set(
      market,
      new Intl.DateTimeFormat("en-SG", {
        dateStyle: "long",
        timeZone: eventZones[market].zone,
      }),
    );
  }
  return dateFormatters.get(market)!.format(new Date(value));
}

export function formatEventTime(value: string, market: Market) {
  if (!timeFormatters.has(market)) {
    timeFormatters.set(
      market,
      new Intl.DateTimeFormat("en-SG", {
        hour: "2-digit",
        minute: "2-digit",
        hourCycle: "h23",
        timeZone: eventZones[market].zone,
      }),
    );
  }
  return timeFormatters.get(market)!.format(new Date(value));
}

export function regionalEvents(entries: EventEntry[], market: Market) {
  return entries
    .filter(
      (entry) =>
        entry.kind === "event" &&
        entry.status === "published" &&
        (!entry.market || entry.market === market) &&
        /^[a-z0-9-]{1,120}$/.test(entry.slug) &&
        entry.starts_at &&
        Number.isFinite(Date.parse(entry.starts_at)),
    )
    .sort(
      (a, b) =>
        Date.parse(a.starts_at!) - Date.parse(b.starts_at!) ||
        a.id.localeCompare(b.id),
    );
}

export function upcomingEvents(
  entries: EventEntry[],
  market: Market,
  now = new Date(),
) {
  return regionalEvents(entries, market).filter(
    (entry) => Date.parse(entry.starts_at!) > now.getTime(),
  );
}

export function eventMonth(value: unknown, market: Market, now = new Date()) {
  const current = eventDateKey(now, market)!.slice(0, 7);
  const key =
    typeof value === "string" &&
    /^(19\d{2}|20\d{2}|2100)-(0[1-9]|1[0-2])$/.test(value)
      ? value
      : current;
  const year = Number(key.slice(0, 4));
  const month = Number(key.slice(5, 7));
  const start = new Date(Date.UTC(year, month - 1, 1));
  const days = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const firstWeekday = (start.getUTCDay() + 6) % 7;
  const rows = Math.ceil((firstWeekday + days) / 7);
  const shift = (amount: number) => {
    const date = new Date(Date.UTC(year, month - 1 + amount, 1));
    const shifted = date.toISOString().slice(0, 7);
    return shifted >= "1900-01" && shifted <= "2100-12" ? shifted : null;
  };
  return {
    key,
    title: new Intl.DateTimeFormat("en", {
      month: "long",
      year: "numeric",
      timeZone: "UTC",
    }).format(start),
    previous: shift(-1),
    next: shift(1),
    weeks: Array.from({ length: rows }, (_, row) =>
      Array.from({ length: 7 }, (_, column) => {
        const day = row * 7 + column - firstWeekday + 1;
        return day > 0 && day <= days
          ? `${key}-${String(day).padStart(2, "0")}`
          : null;
      }),
    ),
  };
}
