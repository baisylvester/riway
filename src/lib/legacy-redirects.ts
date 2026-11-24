// Legacy URL redirect map for the public-launch SEO migration (audit G24).
//
// The map is intentionally empty: RIWAY has not yet supplied the inventory of
// existing public URLs (the current official site, product pages and
// campaign links). Add one entry per approved old path once that inventory is
// agreed, then run the unit tests, which reject unsafe or conflicting entries.
// Entries are permanent (308) redirects from an old same-site path to a
// current route on this site; off-site destinations are not allowed here.

export type LegacyRedirect = { source: string; destination: string };

export const legacyRedirects: LegacyRedirect[] = [];

const reserved = [
  "/api",
  "/_next",
  "/admin",
  "/account",
  "/auth",
  "/checkout",
  "/operations",
];

export function validateLegacyRedirects(entries: LegacyRedirect[]) {
  const errors: string[] = [];
  const sources = new Set<string>();
  for (const { source, destination } of entries) {
    if (!/^\/[A-Za-z0-9._~%!$&'()*+,;=:@/-]{0,300}$/.test(source))
      errors.push(`Invalid source path: ${source}`);
    if (/[?#]/.test(source)) errors.push(`Source has a query/hash: ${source}`);
    if (
      !/^\/(?!\/)[A-Za-z0-9._~%/-]{0,300}(\?[A-Za-z0-9=&_-]{0,200})?$/.test(
        destination,
      )
    )
      errors.push(`Destination must be a same-site path: ${destination}`);
    if (reserved.some((r) => source === r || source.startsWith(`${r}/`)))
      errors.push(`Source overlaps an application route: ${source}`);
    const key = source.toLowerCase().replace(/\/+$/, "") || "/";
    if (sources.has(key)) errors.push(`Duplicate source: ${source}`);
    sources.add(key);
    const target = destination.split("?")[0].replace(/\/+$/, "") || "/";
    if (target.toLowerCase() === key) errors.push(`Redirect loop: ${source}`);
  }
  const targets = new Set(
    entries.map((e) => e.destination.split("?")[0].replace(/\/+$/, "") || "/"),
  );
  for (const { source } of entries)
    if (targets.has(source.replace(/\/+$/, "") || "/"))
      errors.push(`Redirect chain through ${source}`);
  return errors;
}

/** Next.js redirects() entries; throws at build time on an invalid map. */
export function nextRedirects(entries: LegacyRedirect[] = legacyRedirects) {
  const errors = validateLegacyRedirects(entries);
  if (errors.length)
    throw new Error(`Invalid legacy redirects: ${errors.join("; ")}`);
  return entries.map(({ source, destination }) => ({
    source,
    destination,
    permanent: true,
  }));
}
