export function pageNumber(value: unknown) {
  if (typeof value !== "string" || !/^\d+$/.test(value)) return 1;
  const page = Number(value);
  return Number.isSafeInteger(page) && page >= 1 ? Math.min(1000, page) : 1;
}
