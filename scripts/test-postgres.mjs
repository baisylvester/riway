import { mkdtempSync, mkdirSync, readFileSync, readdirSync } from "node:fs";
import { resolve, join } from "node:path";
import { spawn, execFileSync } from "node:child_process";
import { createServer } from "node:net";
import { randomUUID } from "node:crypto";
import assert from "node:assert/strict";

// Creates a fresh loopback-only cluster, or uses an explicitly disposable CI service.
const external = !!process.env.RIWAY_TEST_PG_PORT;
if (external && process.env.RIWAY_TEST_DISPOSABLE !== "1")
  throw new Error(
    "Existing PostgreSQL targets require RIWAY_TEST_DISPOSABLE=1.",
  );
const bin =
  process.env.RIWAY_POSTGRES_BIN ||
  (process.platform === "win32"
    ? "C:/Program Files/PostgreSQL/18/bin"
    : "/usr/bin");
const suffix = process.platform === "win32" ? ".exe" : "";
const binary = (name) => join(bin, name + suffix);
mkdirSync(".cache", { recursive: true });
const data = external ? null : mkdtempSync(resolve(".cache/rollout-pg-"));
const listener = createServer();
let port = Number(process.env.RIWAY_TEST_PG_PORT || 0);
if (external && (!Number.isInteger(port) || port < 1 || port > 65535))
  throw new Error("Invalid disposable PostgreSQL port");
if (!external) {
  await new Promise((resolve, reject) =>
    listener.once("error", reject).listen(0, "127.0.0.1", resolve),
  );
  port = listener.address().port;
  await new Promise((resolve) => listener.close(resolve));
}
const args = [
  "-X",
  "-h",
  "127.0.0.1",
  "-p",
  String(port),
  "-U",
  "riway_test",
  "-d",
  "postgres",
  "-v",
  "ON_ERROR_STOP=1",
  "-A",
  "-t",
];
const sql = (text) =>
  execFileSync(binary("psql"), args, {
    input: text,
    encoding: "utf8",
    windowsHide: true,
    stdio: ["pipe", "pipe", "pipe"],
  }).trim();
const admin = "50000000-0000-4000-8000-000000000001";
const tenant = "50000000-0000-4000-8000-000000000002";
const location = "50000000-0000-4000-8000-000000000003";
const item = "50000000-0000-4000-8000-000000000004";
const product = "50000000-0000-4000-8000-000000000005";
const asUser = `select set_config('request.jwt.claims','{"sub":"${admin}","role":"authenticated","aal":"aal2"}',false); set role authenticated;`;
function parallelSql(text) {
  return new Promise((resolve, reject) => {
    const child = spawn(binary("psql"), args, {
      windowsHide: true,
      stdio: ["pipe", "pipe", "pipe"],
    });
    let output = "",
      error = "";
    child.stdout.on("data", (b) => (output += b));
    child.stderr.on("data", (b) => (error += b));
    child.on("error", reject);
    child.on("exit", (code) => resolve({ code, output, error }));
    child.stdin.end(text);
  });
}
let started = false;
try {
  if (!external) {
    execFileSync(
      binary("initdb"),
      [
        "-D",
        data,
        "-U",
        "riway_test",
        "-A",
        "trust",
        "--no-locale",
        "-E",
        "UTF8",
        "--no-sync",
      ],
      { stdio: "pipe", windowsHide: true },
    );
    execFileSync(
      binary("pg_ctl"),
      [
        "-D",
        data,
        "-l",
        join(data, "server.log"),
        "-o",
        `-h 127.0.0.1 -p ${port}`,
        "-w",
        "start",
      ],
      { stdio: "pipe", windowsHide: true },
    );
    started = true;
  }
  sql(readFileSync("tests/security/local-bootstrap.sql", "utf8"));
  const migrations = readdirSync("supabase/migrations")
    .filter((f) => f.endsWith(".sql"))
    .sort();
  for (const file of migrations)
    sql(readFileSync(join("supabase/migrations", file), "utf8"));
  for (const file of [
    "rls.sql",
    "checkout.sql",
    "operations.sql",
    "tenant_inventory.sql",
    "customer_workflows.sql",
    "stripe.sql",
  ])
    sql(readFileSync(join("tests/security", file), "utf8"));
  sql(`insert into auth.users(id,email) values('${admin}','concurrency@example.invalid');
 insert into private.platform_admins values('${admin}');
 insert into public.tenants(id,name) values('${tenant}','Disposable concurrency store');
 insert into public.tenant_memberships(tenant_id,user_id,role) values('${tenant}','${admin}','owner');
 insert into public.products(id,slug,name,category,status) values('${product}','concurrency-product','Concurrency product','Nutrition','published');
 insert into public.tenant_products(id,tenant_id,product_id,sku) values('${item}','${tenant}','${product}','CONCURRENCY');
 insert into public.tenant_locations(id,tenant_id,name,market) values('${location}','${tenant}','Test location','PH');
 ${asUser} select public.mutate_tenant_stock('${tenant}','${location}','${item}','receive',5,'Test stock receipt','${randomUUID()}');`);
  const reserve = (key) =>
    `${asUser} select public.mutate_tenant_stock('${tenant}','${location}','${item}','reserve',1,'Concurrent reservation','${key}');`;
  const races = await Promise.all(
    Array.from({ length: 10 }, () => parallelSql(reserve(randomUUID()))),
  );
  assert.equal(
    races.filter((r) => r.code === 0).length,
    5,
    "Exactly five of ten competing reservations must succeed",
  );
  assert(
    races
      .filter((r) => r.code !== 0)
      .every((r) => r.error.includes("check constraint")),
    "Rejected reservations must fail on stock constraints",
  );
  const shared = randomUUID();
  const receipts = await Promise.all(
    Array.from({ length: 10 }, () =>
      parallelSql(
        `${asUser} select public.mutate_tenant_stock('${tenant}','${location}','${item}','receive',1,'Duplicate receipt','${shared}');`,
      ),
    ),
  );
  assert(
    receipts.every((r) => r.code === 0),
    "All identical replays should succeed",
  );
  const state = JSON.parse(
    sql(
      `select jsonb_build_object('onHand',on_hand,'reserved',reserved,'version',version) from public.tenant_stock where tenant_id='${tenant}';`,
    ),
  );
  assert.deepEqual(state, { onHand: 6, reserved: 5, version: 7 });
  assert.equal(
    sql(
      `select count(*) from public.tenant_stock_ledger where tenant_id='${tenant}' and idempotency_key='${shared}';`,
    ),
    "1",
  );
  const customer = randomUUID(),
    sponsor = randomUUID();
  sql(`insert into auth.users(id,email) values('${customer}','stripe-concurrency@example.invalid'),('${sponsor}','stripe-sponsor@example.invalid');
   insert into public.distributor_profiles(user_id,external_member_id,code,display_name,active,verified_at,market) values('${sponsor}','${sponsor}','QA-${sponsor}','Stripe concurrency fixture',true,now(),'PH');
   insert into public.sponsor_attributions(user_id,distributor_id) values('${customer}','${sponsor}');
   insert into public.product_offers(product_id,market,currency,retail_minor,regulatory_approved,approval_reference) values('${product}','PH','PHP',10000,true,'DISPOSABLE-QA');
   insert into public.inventory(product_id,market,on_hand) values('${product}','PH',10);
   update public.markets set online_sales_approved=true,payments_ready=true,policy_reference='DISPOSABLE-QA' where code='PH';`);
  const paymentOrder =
    sql(`select set_config('request.jwt.claims','{"sub":"${customer}","role":"authenticated","aal":"aal1"}',false);
   set role authenticated;
   select public.create_order('PH','[{"productId":"${product}","quantity":1}]','{"full_name":"Public fixture","phone":"0000000000","line1":"Disposable fixture address","city":"Manila","postal_code":"1000","country":"PH"}','${randomUUID()}','2026-11-draft');`)
      .split("\n")
      .at(-1);
  assert.match(paymentOrder, /^[0-9a-f-]{36}$/);
  const snapshot = JSON.parse(
    sql(
      `select public.prepare_stripe_checkout('${paymentOrder}','${customer}',false,'https://example.invalid');`,
    ),
  );
  const paymentEvent = `evt_${randomUUID()}`;
  const paymentRaces = await Promise.all(
    Array.from({ length: 10 }, () =>
      parallelSql(
        `set role service_role; select public.apply_stripe_checkout_event('${paymentEvent}','${snapshot.id}','${paymentOrder}','cs_test_concurrency',false,10000,'php','complete','paid','pi_concurrency');`,
      ),
    ),
  );
  assert(
    paymentRaces.every((r) => r.code === 0),
    "Concurrent Stripe replays must all be acknowledged",
  );
  assert.equal(
    paymentRaces.filter((r) => r.output.trim().endsWith("paid")).length,
    1,
    "Exactly one event applies stock/payment transitions",
  );
  assert.equal(
    paymentRaces.filter((r) => r.output.trim().endsWith("duplicate")).length,
    9,
  );
  const paymentStock = JSON.parse(
    sql(
      `select jsonb_build_object('onHand',on_hand,'reserved',reserved) from public.inventory where product_id='${product}' and market='PH';`,
    ),
  );
  assert.deepEqual(paymentStock, { onHand: 9, reserved: 0 });
  assert.equal(
    sql(
      `select count(*) from public.inventory_movements where product_id='${product}' and reason='Stripe paid order ${paymentOrder}';`,
    ),
    "1",
  );
  console.log(
    JSON.stringify(
      {
        migrations: migrations.length,
        securitySuites: 6,
        parallelReservations: { attempted: 10, accepted: 5 },
        parallelIdempotentReceipts: { attempted: 10, journalEntries: 1 },
        parallelStripeEvents: {
          attempted: 10,
          applied: 1,
          duplicates: 9,
          paymentStock,
        },
        state,
        dataDirectory: data || "disposable CI service",
      },
      null,
      2,
    ),
  );
} finally {
  if (started)
    execFileSync(binary("pg_ctl"), ["-D", data, "-m", "fast", "-w", "stop"], {
      stdio: "pipe",
      windowsHide: true,
    });
}
