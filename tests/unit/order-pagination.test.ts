import { beforeEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ range: vi.fn(), session: vi.fn() }));
vi.mock("../../src/lib/data", () => ({ requireSession: mocks.session }));
import Orders from "../../src/app/account/orders/page";
import { pageNumber } from "../../src/lib/pagination";
beforeEach(() => {
  vi.clearAllMocks();
  mocks.range.mockResolvedValue({ data: [], error: null });
  mocks.session.mockResolvedValue({
    user: { id: "qa-account" },
    client: {
      from: () => ({
        select: () => ({
          eq: () => ({ order: () => ({ range: mocks.range }) }),
        }),
      }),
    },
  });
});
it("does not pass fractional URL pagination offsets to the database", async () => {
  await Orders({ searchParams: Promise.resolve({ page: "1.11" }) });
  expect(mocks.range).toHaveBeenCalledWith(0, 19);
});
it("preserves normal whole-page navigation", async () => {
  await Orders({ searchParams: Promise.resolve({ page: "2" }) });
  expect(mocks.range).toHaveBeenCalledWith(20, 39);
});
it("rejects malformed page values and bounds valid page numbers", () => {
  for (const value of [
    undefined,
    "",
    "-2",
    "1.11",
    "Infinity",
    ["2", "3"],
    "9007199254740993",
  ])
    expect(pageNumber(value)).toBe(1);
  expect(pageNumber("1001")).toBe(1000);
  expect(pageNumber("20")).toBe(20);
});
