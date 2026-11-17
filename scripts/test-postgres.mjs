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
    // `exit` can fire before stderr pipes drain, hiding the expected SQL error.
    child.on("close", (code) => resolve({ code, output, error }));
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
    "commerce_drafts.sql",
    "commerce_checkout.sql",
    "membership.sql",
    "fulfilment.sql",
    "reports.sql",
    "cancellation.sql",
    "recommendations.sql",
    "scheduled_reports.sql",
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
  sql(
    `insert into public.staff_roles(user_id,market,role) values('${admin}','PH','admin');`,
  );
  const draftDefinition = JSON.stringify({
    components: [{ productId: product, quantity: 2 }],
    retailMinor: null,
    memberMinor: null,
  });
  const draftId = sql(
    `${asUser} select public.save_commerce_draft(null,'package','PH','Concurrent package','draft','${draftDefinition}'::jsonb,0)->>'id';`,
  )
    .split("\n")
    .at(-1);
  assert.match(draftId, /^[0-9a-f-]{36}$/);
  const draftRaces = await Promise.all(
    ["First edit", "Second edit"].map((name) =>
      parallelSql(
        `${asUser} select public.save_commerce_draft('${draftId}','package','PH','${name}','review','${draftDefinition}'::jsonb,1);`,
      ),
    ),
  );
  assert.equal(
    draftRaces.filter((result) => result.code === 0).length,
    1,
    "Exactly one competing draft edit succeeds",
  );
  assert.equal(
    draftRaces.filter(
      (result) =>
        result.code !== 0 && result.error.includes("Commerce draft changed"),
    ).length,
    1,
  );
  assert.equal(
    sql(`select revision from private.commerce_drafts where id='${draftId}';`),
    "2",
  );
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
  const voucherCode = `RACE-${randomUUID().replaceAll("-", "").toUpperCase()}`;
  const promotionDefinition = JSON.stringify({
    productIds: [product],
    discountType: "fixed",
    discountValue: 1,
    minimumSubtotalMinor: 0,
    maximumDiscountMinor: null,
    voucherCode,
    startsAt: new Date(Date.now() - 3600000).toISOString(),
    endsAt: new Date(Date.now() + 3600000).toISOString(),
    audience: "all",
    usageLimit: 1,
  });
  const voucherDraft = sql(
    `${asUser} select public.save_commerce_draft(null,'promotion','PH','Disposable capacity race','review','${promotionDefinition}'::jsonb,0)->>'id';`,
  )
    .split("\n")
    .at(-1);
  const voucherOffer = sql(
    `${asUser} select public.approve_commerce_draft('${voucherDraft}',1,null,'DISPOSABLE-QA-CAPACITY')->>'id';`,
  )
    .split("\n")
    .at(-1);
  const otherCustomer = randomUUID();
  sql(
    `insert into auth.users(id,email) values('${otherCustomer}','voucher-concurrency@example.invalid'); insert into public.sponsor_attributions(user_id,distributor_id) values('${otherCustomer}','${sponsor}');`,
  );
  const voucherOrder = (uid) =>
    `select set_config('request.jwt.claims','{"sub":"${uid}","role":"authenticated","aal":"aal1"}',false); set role authenticated; select public.create_commerce_order('PH','[{"productId":"${product}","quantity":1}]','{"full_name":"Public fixture","phone":"0000000000","line1":"Disposable fixture address","city":"Manila","postal_code":"1000","country":"PH"}','${randomUUID()}','2026-11-draft','${voucherCode}',null);`;
  const voucherRaces = await Promise.all(
    [customer, otherCustomer].map((uid) => parallelSql(voucherOrder(uid))),
  );
  assert.equal(
    voucherRaces.filter((result) => result.code === 0).length,
    1,
    "Exactly one order can reserve the last voucher redemption",
  );
  assert.equal(
    voucherRaces.filter(
      (result) =>
        result.code !== 0 &&
        result.error.includes("Voucher usage limit reached"),
    ).length,
    1,
    "The competing order must fail on voucher capacity",
  );
  assert.equal(
    sql(
      `select count(*) from private.commerce_redemptions where offer_id='${voucherOffer}' and state='reserved';`,
    ),
    "1",
  );
  assert.equal(
    sql(
      `select reserved from public.inventory where product_id='${product}' and market='PH';`,
    ),
    "1",
    "Rejected voucher order must not leave reserved stock",
  );
  sql(
    `update public.inventory_reservations set expires_at=now()-interval '1 minute' where order_id in (select order_id from private.commerce_redemptions where offer_id='${voucherOffer}'); set role service_role; select public.release_expired_reservations();`,
  );
  assert.equal(
    sql(
      `select count(*) from private.commerce_redemptions where offer_id='${voucherOffer}' and state='reserved';`,
    ),
    "0",
    "No-attempt expiry must release voucher capacity",
  );
  const capacityRetry = await parallelSql(voucherOrder(otherCustomer));
  assert.equal(capacityRetry.code, 0, "Released capacity must be reusable");
  sql(
    `update public.inventory_reservations set expires_at=now()-interval '1 minute' where order_id in (select order_id from private.commerce_redemptions where offer_id='${voucherOffer}'); set role service_role; select public.release_expired_reservations();`,
  );
  const raceOrder = sql(
    `select set_config('request.jwt.claims','{"sub":"${customer}","role":"authenticated","aal":"aal1"}',false); set role authenticated; select public.create_order('PH','[{"productId":"${product}","quantity":1}]','{"full_name":"Public fixture","phone":"0000000000","line1":"Disposable fixture address","city":"Manila","postal_code":"1000","country":"PH"}','${randomUUID()}','2026-11-draft');`,
  )
    .split("\n")
    .at(-1);
  sql(
    `update public.inventory_reservations set expires_at=clock_timestamp()+interval '250 milliseconds' where order_id='${raceOrder}';`,
  );
  const expiryRace = await Promise.all([
    parallelSql(
      `begin; select id from public.orders where id='${raceOrder}' for update; select pg_sleep(0.4); set local role service_role; select public.prepare_stripe_checkout('${raceOrder}','${customer}',false,'https://example.invalid'); commit;`,
    ),
    parallelSql(
      "select pg_sleep(0.3); set role service_role; select public.release_expired_reservations();",
    ),
  ]);
  assert.equal(
    expiryRace[1].code,
    0,
    "Expiry cleanup must tolerate concurrent preparation",
  );
  if (expiryRace[0].code !== 0)
    assert.match(expiryRace[0].error, /Order is closed|Reservation expired/);
  // Drain an orphan skipped during the concurrent transaction; a committed
  // Stripe attempt must remain protected after its original local expiry.
  sql("set role service_role; select public.release_expired_reservations();");
  const expiryState = JSON.parse(
    sql(
      `select jsonb_build_object('status',o.status,'reserved',(select count(*) from public.inventory_reservations where order_id=o.id),'attempt',(select id from private.stripe_checkouts where order_id=o.id)) from public.orders o where o.id='${raceOrder}';`,
    ),
  );
  if (expiryState.attempt) {
    assert.equal(expiryState.status, "awaiting_payment");
    assert.equal(expiryState.reserved, 1);
    sql(
      `set role service_role; select public.apply_stripe_checkout_event('evt_expiry_race_${randomUUID()}','${expiryState.attempt}','${raceOrder}','cs_test_expiry_race',false,10000,'php','expired','unpaid',null);`,
    );
  } else {
    assert.equal(expiryState.status, "cancelled");
    assert.equal(expiryState.reserved, 0);
  }
  assert.equal(
    sql(
      `select reserved from public.inventory where product_id='${product}' and market='PH';`,
    ),
    "0",
  );
  // Different qualifying packages have different physical stock rows. This
  // forces the membership user lock, rather than a shared stock lock, to
  // serialize the two canonical payment settlements.
  const memberCustomer = randomUUID();
  sql(`insert into auth.users(id,email) values('${memberCustomer}','membership-race@example.invalid');
    insert into public.sponsor_attributions(user_id,distributor_id) values('${memberCustomer}','${sponsor}');`);
  const memberIdentity = `select set_config('request.jwt.claims','{"sub":"${memberCustomer}","role":"authenticated","aal":"aal1"}',false); set role authenticated;`;
  const memberFixtures = [];
  for (let index = 0; index < 2; index++) {
    const physical = randomUUID(),
      packageSku = randomUUID();
    sql(`insert into public.products(id,slug,name,category,status) values
      ('${physical}','membership-physical-${index}','Disposable membership physical ${index}','Nutrition','published'),
      ('${packageSku}','membership-package-${index}','Disposable membership package ${index}','Packages','published');
      insert into public.product_offers(product_id,market,currency,retail_minor,regulatory_approved,approval_reference,max_quantity)
      values('${physical}','PH','PHP',6000,true,'DISPOSABLE-MEMBERSHIP-ONLY',24);
      insert into public.inventory(product_id,market,on_hand) values('${physical}','PH',10);`);
    const definition = JSON.stringify({
      components: [{ productId: physical, quantity: 1 }],
      retailMinor: 5000,
      memberMinor: 4000,
    });
    const draft = sql(
      `${asUser} select public.save_commerce_draft(null,'package','PH','Disposable membership package ${index}','review','${definition}'::jsonb,0)->>'id';`,
    )
      .split("\n")
      .at(-1);
    const offerId = sql(
      `${asUser} select public.approve_commerce_draft('${draft}',1,'${packageSku}','DISPOSABLE-MEMBERSHIP-PACKAGE')->>'id';`,
    )
      .split("\n")
      .at(-1);
    assert.match(offerId, /^[0-9a-f-]{36}$/);
    sql(
      `update public.product_offers set regulatory_approved=true,approval_reference='DISPOSABLE-MEMBERSHIP-ONLY' where product_id='${packageSku}' and market='PH';`,
    );
    const rule = JSON.parse(
      sql(
        `${asUser} select public.approve_membership_rule('${offerId}','SAMPLE_RACE','Sample concurrency tier',1,'SAMPLE-TERMS-1','Sample terms for disposable membership concurrency testing only.','SAMPLE-CODE-1','Sample conduct for disposable membership concurrency testing only.','DISPOSABLE-MEMBERSHIP-RULE');`,
      )
        .split("\n")
        .at(-1),
    );
    const selection = JSON.stringify([{ productId: packageSku, quantity: 1 }]);
    const quote = JSON.parse(
      sql(
        `${memberIdentity} select public.quote_commerce_checkout('PH','${selection}'::jsonb,null);`,
      )
        .split("\n")
        .at(-1),
    );
    assert.equal(quote.membership.ruleId, rule.id);
    const consent = JSON.stringify({
      ruleId: rule.id,
      termsVersion: "SAMPLE-TERMS-1",
      codeVersion: "SAMPLE-CODE-1",
      accepted: true,
    });
    const order = sql(
      `${memberIdentity} select public.create_membership_commerce_order('PH','${selection}'::jsonb,'{"full_name":"Disposable member","phone":"0000000000","line1":"Disposable fixture address","city":"Manila","postal_code":"1000","country":"PH"}'::jsonb,'${randomUUID()}','2026-11-draft',null,'${quote.quoteHash}','${consent}'::jsonb);`,
    )
      .split("\n")
      .at(-1);
    assert.match(order, /^[0-9a-f-]{36}$/);
    const attempt = JSON.parse(
      sql(
        `set role service_role; select public.prepare_stripe_checkout('${order}','${memberCustomer}',false,'https://example.invalid');`,
      )
        .split("\n")
        .at(-1),
    );
    memberFixtures.push({ physical, order, attempt });
  }
  const memberPaymentRaces = await Promise.all(
    memberFixtures.map(({ order, attempt }, index) =>
      parallelSql(
        `set statement_timeout='10s'; set role service_role; select public.apply_stripe_checkout_event('evt_membership_${randomUUID()}','${attempt.id}','${order}','cs_test_membership_${index}',false,5000,'php','complete','paid','pi_membership${index}');`,
      ),
    ),
  );
  assert(
    memberPaymentRaces.every((result) => result.code === 0),
    "Both independent paid membership orders must settle without deadlock",
  );
  const memberState = JSON.parse(
    sql(`select jsonb_build_object(
    'pending',(select count(*) from private.membership_enrollments where user_id='${memberCustomer}' and status='pending_verification'),
    'notApplied',(select count(*) from private.membership_enrollments where user_id='${memberCustomer}' and status='not_applied'),
    'members',(select count(*) from public.memberships where user_id='${memberCustomer}'),
    'requests',(select count(*) from private.notification_jobs where user_id='${memberCustomer}' and kind='membership_requested'),
    'paidOrders',(select count(*) from public.orders where user_id='${memberCustomer}' and status='paid' and payment_status='paid'));`),
  );
  assert.deepEqual(memberState, {
    pending: 1,
    notApplied: 1,
    members: 0,
    requests: 1,
    paidOrders: 2,
  });
  for (const fixture of memberFixtures) {
    assert.deepEqual(
      JSON.parse(
        sql(
          `select jsonb_build_object('onHand',on_hand,'reserved',reserved) from public.inventory where product_id='${fixture.physical}' and market='PH';`,
        ),
      ),
      { onHand: 9, reserved: 0 },
    );
  }
  const memberEnrollment = sql(
    `select id from private.membership_enrollments where user_id='${memberCustomer}' and status='pending_verification';`,
  );
  const memberConfirmRaces = await Promise.all(
    [0, 1].map((index) =>
      parallelSql(`${asUser}
    set statement_timeout='10s'; select public.confirm_membership_enrollment('${memberEnrollment}','SAMPLE-RACE-${index}-${memberCustomer}','DISPOSABLE-CONFIRMATION-${index}');`),
    ),
  );
  assert.equal(
    memberConfirmRaces.filter((result) => result.code === 0).length,
    1,
    "Only one conflicting external membership confirmation may succeed",
  );
  assert.equal(
    memberConfirmRaces.filter(
      (result) =>
        result.code !== 0 &&
        result.error.includes("already confirmed with different data"),
    ).length,
    1,
  );
  const memberConfirmed = JSON.parse(
    sql(
      `select jsonb_build_object('externalId',external_member_id,'reference',confirmation_reference) from private.membership_enrollments where id='${memberEnrollment}';`,
    ),
  );
  const memberConfirmReplays = await Promise.all(
    Array.from({ length: 4 }, () =>
      parallelSql(`${asUser}
    set statement_timeout='10s'; select public.confirm_membership_enrollment('${memberEnrollment}','${memberConfirmed.externalId}','${memberConfirmed.reference}');`),
    ),
  );
  assert(
    memberConfirmReplays.every((result) => result.code === 0),
    "Identical confirmed membership retries must be acknowledged",
  );
  assert.equal(
    sql(
      `select count(*) from public.memberships where user_id='${memberCustomer}' and external_member_id='${memberConfirmed.externalId}' and status='active';`,
    ),
    "1",
  );
  assert.equal(
    sql(
      `select count(*) from private.notification_jobs where user_id='${memberCustomer}' and kind='membership_confirmed';`,
    ),
    "1",
    "Confirmation retries must not duplicate welcome notifications",
  );
  assert.equal(
    sql(
      `select count(*) from public.audit_logs where entity='membership_enrollments' and entity_id='${memberEnrollment}' and action='MEMBERSHIP_CONFIRM:PH';`,
    ),
    "1",
  );
  console.log(
    JSON.stringify(
      {
        migrations: migrations.length,
        securitySuites: 9,
        parallelMembershipPayments: memberState,
        parallelMembershipConfirmations: {
          attempted: 2,
          accepted: 1,
          conflicts: 1,
          identicalReplays: memberConfirmReplays.length,
          confirmedMemberships: 1,
          confirmationNotifications: 1,
        },
        parallelVoucherCapacity: { attempted: 2, accepted: 1, rejected: 1 },
        voucherCapacityReusableAfterExpiry: true,
        concurrentPrepareExpiry: {
          protectedAttempt: !!expiryState.attempt,
          orphanDrained: true,
        },
        parallelDraftEdits: { attempted: 2, accepted: 1, conflicts: 1 },
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
