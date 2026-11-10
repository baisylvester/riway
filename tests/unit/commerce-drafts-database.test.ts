import { PGlite } from "@electric-sql/pglite";
import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const pg = new PGlite();
const root = resolve(import.meta.dirname, "../..");
const admin = "71000000-0000-4000-8000-000000000001";
const product = "71000000-0000-4000-8000-000000000101";
const archived = "71000000-0000-4000-8000-000000000102";
const nested = "71000000-0000-4000-8000-000000000103";
const packageDefinition = () => ({
  components: [{ productId: product, quantity: 2 }],
  retailMinor: null,
  memberMinor: null,
});
const promotionDefinition = () => ({
  productIds: [product],
  discountType: "percent",
  discountValue: 1000,
  minimumSubtotalMinor: 0,
  maximumDiscountMinor: null,
  voucherCode: "FIXTURE-ONLY",
  startsAt: "2027-01-01T00:00:00Z",
  endsAt: "2027-02-01T00:00:00.000Z",
  audience: "all",
  usageLimit: null,
});

async function save(kind: string, definition: unknown) {
  return pg.query<{ result: any }>(
    "select public.save_commerce_draft(null,$1,'PH','Fixture draft','draft',$2::jsonb,0) as result",
    [kind, JSON.stringify(definition)],
  );
}

beforeAll(async () => {
  await pg.exec(
    readFileSync(resolve(root, "tests/security/local-bootstrap.sql"), "utf8"),
  );
  for (const file of readdirSync(resolve(root, "supabase/migrations"))
    .filter((file) => file.endsWith(".sql"))
    .sort()) {
    await pg.exec(
      readFileSync(resolve(root, "supabase/migrations", file), "utf8"),
    );
  }
  await pg.exec(`
    insert into auth.users(id,email) values('${admin}','commerce-unit@example.invalid');
    insert into public.staff_roles(user_id,market,role) values('${admin}','PH','admin');
    insert into public.products(id,slug,name,category,status) values
      ('${product}','commerce-unit-product','Fixture product','Nutrition','draft'),
      ('${archived}','commerce-unit-archived','Archived fixture','Skincare','archived'),
      ('${nested}','commerce-unit-nested','Package fixture','Packages','draft');
    select set_config('request.jwt.claims','{"sub":"${admin}","role":"authenticated","aal":"aal2"}',false);
    set role authenticated;
  `);
}, 30000);
afterAll(async () => {
  await pg.close();
});

describe("commerce draft SQL contract", () => {
  it("passes rollback-only role, market, MFA and version security acceptance", async () => {
    await pg.exec(
      "reset role; select set_config('request.jwt.claims','{}',false)",
    );
    try {
      await pg.exec(
        readFileSync(
          resolve(root, "tests/security/commerce_drafts.sql"),
          "utf8",
        ),
      );
    } finally {
      await pg.exec(
        `rollback; reset role; select set_config('request.jwt.claims','{"sub":"${admin}","role":"authenticated","aal":"aal2"}',false); set role authenticated;`,
      );
    }
  });
  it("stores package/promotion drafts and derives currency without selling them", async () => {
    const packageDraft = (await save("package", packageDefinition())).rows[0]
      .result;
    const promotionDraft = (await save("promotion", promotionDefinition()))
      .rows[0].result;
    expect(packageDraft).toMatchObject({
      kind: "package",
      status: "draft",
      market: "PH",
      currency: "PHP",
      revision: 1,
      createdBy: admin,
      updatedBy: admin,
    });
    expect(promotionDraft.definition).toEqual(promotionDefinition());
  });
  const packageCases: Array<[string, (d: any) => unknown]> = [
    ["unknown keys", (d) => ({ ...d, currency: "USD" })],
    ["missing keys", (d) => ({ components: d.components, retailMinor: null })],
    ["empty components", (d) => ({ ...d, components: [] })],
    [
      "too many components",
      (d) => ({
        ...d,
        components: Array.from({ length: 31 }, () => d.components[0]),
      }),
    ],
    [
      "duplicate components",
      (d) => ({ ...d, components: [d.components[0], d.components[0]] }),
    ],
    [
      "unknown product",
      (d) => ({
        ...d,
        components: [
          { productId: "71000000-0000-4000-8000-000000000199", quantity: 1 },
        ],
      }),
    ],
    [
      "archived product",
      (d) => ({ ...d, components: [{ productId: archived, quantity: 1 }] }),
    ],
    [
      "nested package",
      (d) => ({ ...d, components: [{ productId: nested, quantity: 1 }] }),
    ],
    [
      "component unknown keys",
      (d) => ({ ...d, components: [{ ...d.components[0], price: 1 }] }),
    ],
    [
      "zero quantity",
      (d) => ({ ...d, components: [{ ...d.components[0], quantity: 0 }] }),
    ],
    [
      "fractional quantity",
      (d) => ({ ...d, components: [{ ...d.components[0], quantity: 1.5 }] }),
    ],
    [
      "excessive quantity",
      (d) => ({ ...d, components: [{ ...d.components[0], quantity: 1001 }] }),
    ],
    [
      "string quantity",
      (d) => ({ ...d, components: [{ ...d.components[0], quantity: "2" }] }),
    ],
    ["zero price", (d) => ({ ...d, retailMinor: 0 })],
    ["negative member price", (d) => ({ ...d, memberMinor: -1 })],
    ["fractional price", (d) => ({ ...d, retailMinor: 2.5 })],
    ["too large price", (d) => ({ ...d, retailMinor: 100000001 })],
    ["oversized definition", (d) => ({ ...d, extra: "x".repeat(16385) })],
  ];
  it.each(packageCases)(
    "rejects package %s through direct SQL",
    async (_name, change) => {
      await expect(
        save("package", change(packageDefinition())),
      ).rejects.toThrow();
    },
  );
  const promotionCases: Array<[string, (d: any) => unknown]> = [
    ["unknown keys", (d) => ({ ...d, active: true })],
    [
      "missing keys",
      (d) => {
        delete d.audience;
        return d;
      },
    ],
    ["empty target list", (d) => ({ ...d, productIds: [] })],
    ["duplicate target", (d) => ({ ...d, productIds: [product, product] })],
    ["archived target", (d) => ({ ...d, productIds: [archived] })],
    ["invalid target ID", (d) => ({ ...d, productIds: ["not-a-uuid"] })],
    ["unknown discount type", (d) => ({ ...d, discountType: "bonus" })],
    ["zero discount", (d) => ({ ...d, discountValue: 0 })],
    ["percentage over 100 percent", (d) => ({ ...d, discountValue: 10001 })],
    ["fractional discount", (d) => ({ ...d, discountValue: 1.5 })],
    ["negative subtotal", (d) => ({ ...d, minimumSubtotalMinor: -1 })],
    ["invalid percentage cap", (d) => ({ ...d, maximumDiscountMinor: 0 })],
    [
      "fixed discount cap",
      (d) => ({ ...d, discountType: "fixed", maximumDiscountMinor: 100 }),
    ],
    ["lowercase voucher", (d) => ({ ...d, voucherCode: "lowercase" })],
    ["short voucher", (d) => ({ ...d, voucherCode: "AB" })],
    ["invalid audience", (d) => ({ ...d, audience: "vip" })],
    ["zero usage limit", (d) => ({ ...d, usageLimit: 0 })],
    ["usage limit over maximum", (d) => ({ ...d, usageLimit: 1000001 })],
    ["reversed window", (d) => ({ ...d, endsAt: "2026-01-01T00:00:00Z" })],
    ["equal window", (d) => ({ ...d, endsAt: d.startsAt })],
    [
      "invalid calendar date",
      (d) => ({ ...d, startsAt: "2027-02-30T00:00:00Z" }),
    ],
    ["invalid leap date", (d) => ({ ...d, startsAt: "1900-02-29T00:00:00Z" })],
    ["24-hour rollover", (d) => ({ ...d, startsAt: "2027-01-01T24:00:00Z" })],
    [
      "leap-second rollover",
      (d) => ({ ...d, startsAt: "2027-01-01T00:00:60Z" }),
    ],
    ["offset date", (d) => ({ ...d, startsAt: "2027-01-01T00:00:00+00:00" })],
    ["year before range", (d) => ({ ...d, startsAt: "1899-01-01T00:00:00Z" })],
    ["year after range", (d) => ({ ...d, endsAt: "2101-01-01T00:00:00Z" })],
  ];
  it.each(promotionCases)(
    "rejects promotion %s through direct SQL",
    async (_name, change) => {
      await expect(
        save("promotion", change(promotionDefinition())),
      ).rejects.toThrow();
    },
  );
  it("accepts fixed promotion and date/number boundaries", async () => {
    const value = {
      ...promotionDefinition(),
      discountType: "fixed",
      discountValue: 100000000,
      minimumSubtotalMinor: 100000000,
      usageLimit: 1000000,
      startsAt: "1900-01-01T00:00:00.1Z",
      endsAt: "2100-12-31T23:59:59.999Z",
      voucherCode: null,
      audience: "member",
    };
    expect((await save("promotion", value)).rows[0].result.definition).toEqual(
      value,
    );
    const pkg = {
      ...packageDefinition(),
      components: [{ productId: product, quantity: 1000 }],
      retailMinor: 100000000,
      memberMinor: 1,
    };
    expect((await save("package", pkg)).rows[0].result.definition).toEqual(pkg);
  });
});
