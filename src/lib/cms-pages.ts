import { db } from "@/lib/supabase/server";
import type { Market } from "@/lib/domain";
import { isLive, type Schedulable } from "@/lib/content-schedule";

// CMS-backed static page sections (audit G15-G18, A04). Staff create
// content_entries of kind "page" whose slug follows this convention; only
// compliance-published entries are visible to the public (database policy).
//   <key>                 all markets, English
//   <key>-<market>        one market, e.g. about-history-ph
//   <key>-<locale>        a language, e.g. support-contacts-fil
//   <key>-<market>-<locale>
// The most specific published entry wins. Pages show their existing notices
// when no approved entry exists.

export const pageKeys = {
  about: [
    "about-history",
    "about-leadership",
    "about-golden-deer-award",
    "about-foundation",
    "about-baby-pegasus",
  ],
  membership: [
    "membership-overview",
    "membership-packages",
    "membership-compensation",
  ],
  support: [
    "support-contacts",
    "support-shipping",
    "support-returns",
    "support-refunds",
  ],
} as const;

export type CmsSection = { key: string; title: string; body: string };

export function slugCandidates(key: string, market: Market, locale = "en") {
  const m = market.toLowerCase();
  const l = locale.toLowerCase();
  const list = [`${key}-${m}-${l}`, `${key}-${l}`, `${key}-${m}`, key];
  return locale === "en" ? list.filter((s) => s !== `${key}-en`) : list;
}

/** Picks the most specific published entry per key, in key order. */
export function pickSections(
  keys: readonly string[],
  market: Market,
  rows: { slug: string; title: string; body: string }[],
  locale = "en",
): CmsSection[] {
  const bySlug = new Map(rows.map((r) => [r.slug, r]));
  const out: CmsSection[] = [];
  for (const key of keys) {
    const hit = slugCandidates(key, market, locale)
      .map((s) => bySlug.get(s))
      .find(Boolean);
    if (hit && hit.body.trim())
      out.push({ key, title: hit.title, body: hit.body });
  }
  return out;
}

export async function cmsSections(
  keys: readonly string[],
  market: Market,
  locale = "en",
): Promise<CmsSection[]> {
  const slugs = keys.flatMap((k) => slugCandidates(k, market, locale));
  try {
    const { data, error } = await (
      await db()
    )
      .from("content_entries")
      .select("slug,title,body,market,status,publish_at,unpublish_at")
      .eq("kind", "page")
      .eq("status", "published")
      .in("slug", slugs);
    if (error || !data) return [];
    // A market-specific slug must also be stored for that market.
    const rows = data.filter(
      (r: { slug: string; market: string | null } & Schedulable) =>
        (!r.market || r.market === market) && isLive(r),
    );
    return pickSections(keys, market, rows, locale);
  } catch {
    return [];
  }
}

export type Block =
  | { type: "heading"; text: string }
  | { type: "list"; items: string[] }
  | { type: "paragraph"; text: string };

/** Plain-text body to blocks: "## " headings, "- " bullets, blank-line paragraphs. No HTML. */
export function bodyBlocks(body: string): Block[] {
  const blocks: Block[] = [];
  for (const chunk of body.replace(/\r\n/g, "\n").split(/\n{2,}/)) {
    const lines = chunk
      .split("\n")
      .map((l) => l.trim())
      .filter(Boolean);
    if (!lines.length) continue;
    if (lines.every((l) => l.startsWith("- ")))
      blocks.push({ type: "list", items: lines.map((l) => l.slice(2)) });
    else if (lines.length === 1 && lines[0].startsWith("## "))
      blocks.push({ type: "heading", text: lines[0].slice(3) });
    else blocks.push({ type: "paragraph", text: lines.join(" ") });
  }
  return blocks;
}
