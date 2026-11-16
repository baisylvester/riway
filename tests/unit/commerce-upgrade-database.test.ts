import { PGlite } from "@electric-sql/pglite";
import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const pg = new PGlite();
const root = resolve(import.meta.dirname, "../..");
const customer = "73000000-0000-4000-8000-000000000001";
const sponsor = "73000000-0000-4000-8000-000000000002";
const physical = "73000000-0000-4000-8000-000000000003";
const legacyPackage = "73000000-0000-4000-8000-000000000004";
const ordinaryKey = "73000000-0000-4000-8000-000000000005";
const packageKey = "73000000-0000-4000-8000-000000000006";
const delivery = {
  full_name: "Upgrade fixture",
  phone: "0000000000",
  line1: "Disposable upgrade address",
  city: "Manila",
  postal_code: "1000",
  country: "PH",
};
const ordinaryItems = [{ productId: physical, quantity: 2 }];
const packageItems = [{ productId: legacyPackage, quantity: 1 }];
let ordinaryOrder: string, packageOrder: string, oldAttempt: any;

async function asCustomer() {
  await pg.exec(
    `reset role; select set_config('request.jwt.claims','{"sub":"${customer}","role":"authenticated","aal":"aal1"}',false); set role authenticated;`,
  );
}
async function oldOrder(items: unknown, key: string) {
  return (
    await pg.query<{ result: string }>(
      "select public.create_order('PH',$1::jsonb,$2::jsonb,$3::uuid,'2026-11-draft') as result",
      [JSON.stringify(items), JSON.stringify(delivery), key],
    )
  ).rows[0].result;
}
async function seedBeforeExtension() {
  await pg.exec(`
    insert into auth.users(id,email) values('${customer}','upgrade-customer@example.invalid'),('${sponsor}','upgrade-sponsor@example.invalid');
    insert into public.distributor_profiles(user_id,external_member_id,code,display_name,active,verified_at,market) values('${sponsor}','UPGRADE-SPONSOR','UPGRADE-SPONSOR','Upgrade sponsor',true,now(),'PH');
    insert into public.sponsor_attributions(user_id,distributor_id) values('${customer}','${sponsor}');
    insert into public.products(id,slug,name,category,status) values('${physical}','upgrade-physical','Upgrade physical','Nutrition','published'),('${legacyPackage}','upgrade-package','Legacy package SKU','Packages','published');
    insert into public.product_offers(product_id,market,currency,retail_minor,regulatory_approved,approval_reference,max_quantity) values('${physical}','PH','PHP',1000,true,'UPGRADE-FIXTURE',6),('${legacyPackage}','PH','PHP',2500,true,'UPGRADE-FIXTURE',6);
    insert into public.inventory(product_id,market,on_hand) values('${physical}','PH',10),('${legacyPackage}','PH',10);
    update public.markets set online_sales_approved=true,payments_ready=true,policy_reference='UPGRADE-FIXTURE' where code='PH';
  `);
  await asCustomer();
  ordinaryOrder = await oldOrder(ordinaryItems, ordinaryKey);
  packageOrder = await oldOrder(packageItems, packageKey);
  await pg.exec("reset role; set role service_role;");
  const prepared = (
    await pg.query<{ result: any }>(
      "select public.prepare_stripe_checkout($1::uuid,$2::uuid,false,'https://old.example.invalid') as result",
      [ordinaryOrder, customer],
    )
  ).rows[0].result;
  await pg.query(
    "select public.bind_stripe_checkout($1::uuid,'cs_test_upgrade_old','https://checkout.stripe.com/c/pay/upgrade_fixture')",
    [prepared.id],
  );
  oldAttempt = (
    await pg.query<{ result: any }>(
      "select public.prepare_stripe_checkout($1::uuid,$2::uuid,false,'https://old.example.invalid') as result",
      [ordinaryOrder, customer],
    )
  ).rows[0].result;
  await pg.exec(
    "reset role; select set_config('request.jwt.claims','{}',false);",
  );
}

beforeAll(async () => {
  await pg.exec(
    readFileSync(resolve(root, "tests/security/local-bootstrap.sql"), "utf8"),
  );
  let seeded = false;
  for (const name of readdirSync(resolve(root, "supabase/migrations"))
    .filter((name) => name.endsWith(".sql"))
    .sort()) {
    if (name.endsWith("_approved_commerce_checkout.sql")) {
      await seedBeforeExtension();
      seeded = true;
    }
    await pg.exec(
      readFileSync(resolve(root, "supabase/migrations", name), "utf8"),
    );
  }
  if (!seeded)
    throw Error("Upgrade acceptance requires the commerce migration.");
}, 30000);
afterAll(async () => {
  await pg.close();
});

describe("commerce upgrade with existing orders", () => {
  it("backfills legacy holds and preserves an existing Stripe attempt and idempotency fingerprint", async () => {
    await pg.exec("reset role;");
    expect(
      (
        await pg.query<{ count: number }>(
          "select count(*)::integer as count from private.order_inventory_items where legacy_sku",
        )
      ).rows[0].count,
    ).toBe(2);
    const snapshot = (
      await pg.query<{ result: any }>(
        "select jsonb_build_object('net',net_minor,'discount',discount_minor) as result from public.order_items where order_id=$1::uuid",
        [ordinaryOrder],
      )
    ).rows[0].result;
    expect(snapshot).toEqual({ net: 2000, discount: 0 });
    await pg.exec(
      `update public.product_offers set retail_minor=9000 where product_id='${physical}' and market='PH'; update public.markets set online_sales_approved=false,payments_ready=false where code='PH';`,
    );
    await asCustomer();
    expect(await oldOrder(ordinaryItems, ordinaryKey)).toBe(ordinaryOrder);
    await pg.exec("reset role; set role service_role;");
    const resumed = (
      await pg.query<{ result: any }>(
        "select public.prepare_stripe_checkout($1::uuid,$2::uuid,false,'https://new.example.invalid') as result",
        [ordinaryOrder, customer],
      )
    ).rows[0].result;
    expect(resumed.id).toBe(oldAttempt.id);
    expect(resumed.origin).toBe("https://old.example.invalid");
    expect(resumed.items).toEqual([
      { name: "Upgrade physical", quantity: 2, unitAmount: 1000 },
    ]);
    expect(resumed.items).toEqual(oldAttempt.items);
    expect(
      (
        await pg.query<{ result: string }>(
          "select public.apply_stripe_checkout_event('evt_upgrade_old',$1::uuid,$2::uuid,'cs_test_upgrade_old',false,2000,'php','complete','paid','pi_upgradeold') as result",
          [resumed.id, ordinaryOrder],
        )
      ).rows[0].result,
    ).toBe("paid");
    await pg.exec("reset role;");
    expect(
      (
        await pg.query<{ result: any }>(
          "select jsonb_build_object('onHand',on_hand,'reserved',reserved) as result from public.inventory where product_id=$1::uuid and market='PH'",
          [physical],
        )
      ).rows[0].result,
    ).toEqual({ onHand: 8, reserved: 0 });
  });

  it("honors a pre-upgrade literal package-SKU hold without enabling new composition-free package checkout", async () => {
    await pg.exec(
      "reset role; update public.markets set online_sales_approved=true,payments_ready=true where code='PH';",
    );
    await asCustomer();
    expect(await oldOrder(packageItems, packageKey)).toBe(packageOrder);
    await expect(
      oldOrder(packageItems, "73000000-0000-4000-8000-000000000007"),
    ).rejects.toThrow("Approved package composition unavailable");
    await pg.exec("reset role; set role service_role;");
    const prepared = (
      await pg.query<{ result: any }>(
        "select public.prepare_stripe_checkout($1::uuid,$2::uuid,false,'https://new.example.invalid') as result",
        [packageOrder, customer],
      )
    ).rows[0].result;
    expect(prepared.amount).toBe(2500);
    expect(prepared.items).toEqual([
      { name: "Legacy package SKU × 1", quantity: 1, unitAmount: 2500 },
    ]);
    expect(
      (
        await pg.query<{ result: string }>(
          "select public.apply_stripe_checkout_event('evt_upgrade_package',$1::uuid,$2::uuid,'cs_test_upgrade_package',false,2500,'php','complete','paid','pi_upgradepackage') as result",
          [prepared.id, packageOrder],
        )
      ).rows[0].result,
    ).toBe("paid");
    await pg.exec("reset role;");
    expect(
      (
        await pg.query<{ result: any }>(
          "select jsonb_build_object('onHand',on_hand,'reserved',reserved) as result from public.inventory where product_id=$1::uuid and market='PH'",
          [legacyPackage],
        )
      ).rows[0].result,
    ).toEqual({ onHand: 9, reserved: 0 });
  });
});
