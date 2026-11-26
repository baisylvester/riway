import { it, expect, vi } from "vitest";
const invalidate = vi.hoisted(() => vi.fn());
vi.mock("next/cache", () => ({ revalidatePath: invalidate }));
import { localizedRoute } from "@/lib/locale-routes";
import { revalidatePath } from "@/lib/revalidation";
it("never delegates infrastructure, staff, callback or unknown modules through a locale URL", () => {
  for (const path of [
    ["api", "account", "export"],
    ["admin", "returns"],
    ["auth", "callback"],
    ["operations"],
    ["unknown"],
    ["account", "orders", "one", "extra"],
    ["account", "..", "admin"],
  ])
    expect(localizedRoute("fil", path)).toBeNull();
  expect(localizedRoute("__proto__", ["shop"])).toBeNull();
});
it("keeps dynamic order parameters and the account permission layout together", () => {
  const route = localizedRoute("fil", [
    "account",
    "orders",
    "94000000-0000-4000-8000-000000000001",
  ]);
  expect(route).toMatchObject({
    locale: "fil",
    account: true,
    params: { id: "94000000-0000-4000-8000-000000000001" },
  });
  expect(localizedRoute("fil", ["shop", "sample"])?.account).toBe(false);
});
it("invalidates localized entries when original public or account state is changed", () => {
  invalidate.mockClear();
  revalidatePath("/account/preferences");
  expect(invalidate).toHaveBeenCalledWith("/account/preferences");
  expect(invalidate).toHaveBeenCalledWith("/[locale]/[[...segments]]", "page");
  invalidate.mockClear();
  revalidatePath("/admin/audit");
  expect(invalidate).toHaveBeenCalledTimes(1);
});
