import { PGlite } from "@electric-sql/pglite";
import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { beforeAll, afterAll, describe, it, expect } from "vitest";

// Embedded PostgreSQL executes real migrations, functions, constraints and RLS.
// Auth JWT verification and Storage transport are supplied by Supabase in staging;
// this fixture implements only their SQL interfaces, not hosted JWT verification.
const pg = new PGlite();
const root = resolve(import.meta.dirname, "../..");
const admin = "40000000-0000-4000-8000-000000000001";
const owner = "40000000-0000-4000-8000-000000000002";
const other = "40000000-0000-4000-8000-000000000003";
const viewer = "40000000-0000-4000-8000-000000000004";
let tenant: string, otherTenant: string, location: string, product: string;
async function identity(sub: string, extras: Record<string, unknown> = {}) {
  await pg.exec("reset role");
  await pg.query("select set_config('request.jwt.claims',$1,false)", [
    JSON.stringify({ sub, role: "authenticated", aal: "aal2", ...extras }),
  ]);
  await pg.exec("set role authenticated");
}
async function rpc(sql: string, params: unknown[] = []) {
  return (await pg.query<{ result: any }>(`select ${sql} as result`, params))
    .rows[0].result;
}
async function movement(
  op: string,
  q: number,
  key = crypto.randomUUID(),
  store = tenant,
  loc = location,
  item = product,
) {
  return rpc("public.mutate_tenant_stock($1,$2,$3,$4,$5,$6,$7)", [
    store,
    loc,
    item,
    op,
    q,
    "Sandbox movement",
    key,
  ]);
}

beforeAll(async () => {
  await pg.exec(`
    create role anon; create role authenticated; create role service_role bypassrls;
    create schema auth; create schema storage;
    grant usage on schema auth,storage,public to anon,authenticated,service_role;
    create table auth.users(id uuid primary key,email text,email_confirmed_at timestamptz);
    create function auth.jwt() returns jsonb language sql stable as $$ select coalesce(nullif(current_setting('request.jwt.claims',true),''),'{}')::jsonb $$;
    create function auth.uid() returns uuid language sql stable as $$ select (auth.jwt()->>'sub')::uuid $$;
    create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
    create table storage.objects(id uuid primary key default gen_random_uuid(),bucket_id text,name text,owner_id text);
    alter table storage.objects enable row level security;
    grant select,insert,delete on storage.objects to authenticated;
    create function storage.foldername(text) returns text[] language sql immutable as $$ select string_to_array($1,'/') $$;
    alter default privileges in schema public grant all on tables to service_role;
  `);
  const files = readdirSync(resolve(root, "supabase/migrations"))
    .filter((f) => f.endsWith(".sql"))
    .sort();
  for (const file of files) {
    await pg.exec(
      readFileSync(resolve(root, "supabase/migrations", file), "utf8"),
    );
  }
  await pg.query(
    "insert into auth.users(id,email) values($1,'admin@example.invalid'),($2,'owner@example.invalid'),($3,'other@example.invalid'),($4,'viewer@example.invalid')",
    [admin, owner, other, viewer],
  );
  await pg.query("insert into private.platform_admins values($1)", [admin]);
  await identity(admin);
  tenant = await rpc("public.create_tenant('First store',$1)", [owner]);
  otherTenant = await rpc("public.create_tenant('Second store',$1)", [other]);
  await identity(owner);
  await rpc("public.setup_tenant_inventory($1,'location',$2)", [
    tenant,
    { name: "Main", market: "PH" },
  ]);
  const published = await pg.query<{ id: string }>(
    "select id from public.products limit 1",
  );
  await rpc("public.setup_tenant_inventory($1,'product',$2)", [
    tenant,
    { product_id: published.rows[0].id, sku: "RIWAY-001" },
  ]);
  await rpc("public.setup_tenant_inventory($1,'member',$2)", [
    tenant,
    { user_id: viewer, role: "viewer" },
  ]);
  location = (
    await pg.query<{ id: string }>("select id from public.tenant_locations")
  ).rows[0].id;
  product = (
    await pg.query<{ id: string }>("select id from public.tenant_products")
  ).rows[0].id;
  await pg.exec("reset role; delete from private.notification_jobs");
}, 30000);
afterAll(async () => {
  await pg.close();
});

describe("existing security regression scripts", () => {
  for (const script of [
    "rls.sql",
    "checkout.sql",
    "operations.sql",
    "tenant_inventory.sql",
    "customer_workflows.sql",
  ]) {
    it(`passes ${script} after the identity migration`, async () => {
      await pg.exec(
        "reset role; select set_config('request.jwt.claims','{}',false)",
      );
      try {
        await pg.exec(
          readFileSync(resolve(root, "tests/security", script), "utf8"),
        );
      } catch (error) {
        await pg.exec("rollback; reset role");
        throw error;
      }
    });
  }
});

describe("tenant inventory PostgreSQL security", () => {
  it("isolates stores and rejects cross-tenant references", async () => {
    await identity(other);
    expect(
      (await pg.query("select * from public.tenant_products")).rows,
    ).toHaveLength(0);
    expect((await pg.query("select * from public.tenants")).rows).toHaveLength(
      1,
    );
    await expect(movement("receive", 10)).rejects.toThrow(
      "Inventory access required",
    );
    await expect(
      movement("receive", 10, crypto.randomUUID(), otherTenant),
    ).rejects.toThrow(/foreign key/);
  });
  it("records atomic movements and idempotent replay; rejects changed replay", async () => {
    await identity(owner);
    const key = crypto.randomUUID();
    const first = await movement("receive", 20, key);
    expect(first.on_hand).toBe(20);
    expect((await movement("receive", 20, key)).version).toBe(first.version);
    await expect(movement("receive", 21, key)).rejects.toThrow(
      "Idempotency conflict",
    );
    expect(
      (await pg.query("select * from public.tenant_stock_ledger")).rows,
    ).toHaveLength(1);
  });
  it("prevents overselling and negative stock, preserving reservations and allocations", async () => {
    await identity(owner);
    await movement("reserve", 15);
    await expect(movement("reserve", 6)).rejects.toThrow(/check constraint/);
    await movement("allocate", 10);
    await expect(movement("adjust", -6)).rejects.toThrow(/check constraint/);
    const result = await movement("fulfill", 10);
    expect(result).toMatchObject({ on_hand: 10, reserved: 5, allocated: 0 });
    await expect(movement("damage", 6)).rejects.toThrow(/check constraint/);
    await movement("damage", 5);
    await movement("restore", 5);
  });
  it("rejects access changes for non-members without a false audit event", async () => {
    await pg.exec("reset role");
    const before = (
      await pg.query<{ n: number }>(
        "select count(*)::int as n from public.audit_logs where action='SETUP_ACCESS'",
      )
    ).rows[0].n;
    await identity(owner);
    for (const role of ["inventory", "revoke"]) {
      await expect(
        rpc("public.setup_tenant_inventory($1,'access',$2)", [
          tenant,
          { user_id: other, role },
        ]),
      ).rejects.toThrow("Store member not found");
    }
    await pg.exec("reset role");
    expect(
      (
        await pg.query<{ n: number }>(
          "select count(*)::int as n from public.audit_logs where action='SETUP_ACCESS'",
        )
      ).rows[0].n,
    ).toBe(before);
  });
  it("lets owners configure thresholds without changing stock quantities or movement history", async () => {
    await identity(owner);
    const before = (
      await pg.query<{
        on_hand: number;
        reserved: number;
        allocated: number;
        damaged: number;
      }>("select * from public.tenant_stock")
    ).rows[0];
    const entries = (
      await pg.query("select id from public.tenant_stock_ledger")
    ).rows.length;
    await rpc("public.set_tenant_stock_threshold($1,$2,$3,2)", [
      tenant,
      location,
      product,
    ]);
    expect(
      (await pg.query("select * from public.tenant_stock")).rows[0],
    ).toMatchObject({
      low_stock_threshold: 2,
      on_hand: before.on_hand,
      reserved: before.reserved,
      allocated: before.allocated,
      damaged: before.damaged,
    });
    expect(
      (await pg.query("select id from public.tenant_stock_ledger")).rows.length,
    ).toBe(entries);
    for (const threshold of [-1, 1000001, null]) {
      await expect(
        rpc("public.set_tenant_stock_threshold($1,$2,$3,$4)", [
          tenant,
          location,
          product,
          threshold,
        ]),
      ).rejects.toThrow("Invalid stock threshold");
    }
    await rpc("public.set_tenant_stock_threshold($1,$2,$3,5)", [
      tenant,
      location,
      product,
    ]);
  });
  it("protects threshold configuration with owner, MFA and tenant boundaries", async () => {
    for (const user of [viewer, other]) {
      await identity(user);
      await expect(
        rpc("public.set_tenant_stock_threshold($1,$2,$3,3)", [
          tenant,
          location,
          product,
        ]),
      ).rejects.toThrow("Store owner access required");
    }
    await identity(owner, { aal: "aal1" });
    await expect(
      rpc("public.set_tenant_stock_threshold($1,$2,$3,3)", [
        tenant,
        location,
        product,
      ]),
    ).rejects.toThrow("Store owner access required");
    await identity(admin);
    await expect(
      rpc("public.set_tenant_stock_threshold($1,$2,$3,3)", [
        otherTenant,
        location,
        product,
      ]),
    ).rejects.toThrow(/foreign key/);
  });
  it("prevents viewers from writing or promoting themselves", async () => {
    await identity(viewer);
    expect(
      (await pg.query("select * from public.tenant_stock")).rows,
    ).toHaveLength(1);
    await expect(movement("receive", 1)).rejects.toThrow(
      "Inventory access required",
    );
    await expect(
      rpc("public.setup_tenant_inventory($1,'member',$2)", [
        tenant,
        { user_id: viewer, role: "owner" },
      ]),
    ).rejects.toThrow("Store owner access required");
    await expect(
      pg.exec("update public.tenant_memberships set role='owner'"),
    ).rejects.toThrow(/permission denied/);
    await expect(
      pg.exec("delete from public.tenant_stock_ledger"),
    ).rejects.toThrow(/permission denied/);
  });
  it("requires MFA and reserves all-store oversight for RIWAY super admins", async () => {
    await identity(owner, { aal: "aal1" });
    expect((await pg.query("select * from public.tenants")).rows).toHaveLength(
      0,
    );
    await expect(movement("receive", 1)).rejects.toThrow(
      "Inventory access required",
    );
    await identity(admin);
    expect(await rpc("public.is_platform_admin()")).toBe(true);
    expect((await pg.query("select * from public.tenants")).rows).toHaveLength(
      2,
    );
  });
  it("lets RIWAY suspend stores while retaining oversight", async () => {
    await identity(admin);
    await rpc("public.setup_tenant_inventory($1,'status',$2)", [
      tenant,
      { active: false },
    ]);
    expect(
      (await pg.query("select * from public.tenant_stock")).rows,
    ).toHaveLength(1);
    await identity(owner);
    expect((await pg.query("select * from public.tenants")).rows).toHaveLength(
      0,
    );
    await expect(movement("receive", 1)).rejects.toThrow(
      "Inventory access required",
    );
    await identity(admin);
    await rpc("public.setup_tenant_inventory($1,'status',$2)", [
      tenant,
      { active: true },
    ]);
  });
  it("protects the final owner and immediately revokes store access", async () => {
    await identity(owner);
    await expect(
      rpc("public.setup_tenant_inventory($1,'access',$2)", [
        tenant,
        { user_id: owner, role: "revoke" },
      ]),
    ).rejects.toThrow("retain an owner");
    await rpc("public.setup_tenant_inventory($1,'access',$2)", [
      tenant,
      { user_id: viewer, role: "revoke" },
    ]);
    await identity(viewer);
    expect(
      (await pg.query("select * from public.tenant_stock")).rows,
    ).toHaveLength(0);
  });
});

describe("notification outbox", () => {
  it("preserves never-attempted notifications across delayed provider activation", async () => {
    await pg.exec("reset role; begin");
    try {
      await pg.exec("delete from private.notification_jobs");
      await pg.query(
        `insert into private.notification_jobs(user_id,kind,reference,created_at)
         values($1,'support_received',$2,now()-interval '3 days')`,
        [owner, crypto.randomUUID()],
      );
      await pg.exec("set role service_role");
      const jobs = await rpc("public.claim_notifications()");
      expect(jobs).toHaveLength(1);
      expect(jobs[0].attempts).toBe(1);
      expect(Date.parse(jobs[0].first_attempt_at)).toBeGreaterThan(
        Date.now() - 60000,
      );
    } finally {
      await pg.exec("rollback; reset role");
    }
  });
  it("enqueues atomically, leases jobs exclusively and rejects forged completion tokens", async () => {
    await identity(owner);
    const created = await pg.query<{ id: string }>(
      "insert into public.support_tickets(user_id,market,subject,message) values($1,'PH','Outbox test support','A sufficiently long support message for the outbox.') returning id",
      [owner],
    );
    await expect(rpc("public.claim_notifications()")).rejects.toThrow(
      /permission denied/,
    );
    await pg.exec("reset role; set role service_role");
    const claimed = await rpc("public.claim_notifications()");
    expect(claimed).toHaveLength(1);
    const job = claimed[0];
    expect(job.reference).toBe(created.rows[0].id);
    expect(await rpc("public.claim_notifications()")).toHaveLength(0);
    expect(
      await rpc("public.finish_notification($1,$2,'sent','test-message')", [
        job.id,
        crypto.randomUUID(),
      ]),
    ).toBe(false);
    expect(
      await rpc("public.prepare_notification($1,$2,'test@example.invalid')", [
        job.id,
        job.lease,
      ]),
    ).toBe("test@example.invalid");
    expect(
      await rpc("public.finish_notification($1,$2,'sent','test-message')", [
        job.id,
        job.lease,
      ]),
    ).toBe(true);
    expect(await rpc("public.claim_notifications()")).toHaveLength(0);
  });
  it("expires attempted deliveries after the safety window and preserves retry limits", async () => {
    await pg.exec("reset role; begin");
    try {
      await pg.exec("delete from private.notification_jobs");
      await pg.query(
        `insert into private.notification_jobs(user_id,kind,reference,attempts,first_attempt_at)
         values($1,'support_received',$2,1,now()-interval '24 hours'),
          ($1,'support_received',$3,6,now()-interval '1 hour')`,
        [owner, crypto.randomUUID(), crypto.randomUUID()],
      );
      await pg.exec("set role service_role");
      expect(await rpc("public.claim_notifications()")).toHaveLength(0);
      await pg.exec("reset role");
      const jobs = await pg.query(
        "select status,last_error_code from private.notification_jobs",
      );
      expect(jobs.rows).toEqual([
        { status: "failed", last_error_code: "expired" },
        { status: "failed", last_error_code: "expired" },
      ]);
    } finally {
      await pg.exec("rollback; reset role");
    }
  });
  it("keeps the original retry deadline and recipient when recovering an expired lease", async () => {
    await pg.exec("reset role; begin");
    try {
      await pg.exec("delete from private.notification_jobs");
      await pg.query(
        `insert into private.notification_jobs(user_id,kind,reference)
         values($1,'support_received',$2)`,
        [owner, crypto.randomUUID()],
      );
      await pg.exec("set role service_role");
      const [first] = await rpc("public.claim_notifications()");
      await rpc("public.prepare_notification($1,$2,'owner@example.invalid')", [
        first.id,
        first.lease,
      ]);
      await pg.exec(
        "reset role; update private.notification_jobs set lease_until=now()-interval '1 minute'; set role service_role",
      );
      const [retry] = await rpc("public.claim_notifications()");
      expect(retry.first_attempt_at).toBe(first.first_attempt_at);
      expect(retry.recipient).toBe("owner@example.invalid");
      expect(retry.attempts).toBe(2);
      expect(retry.lease).not.toBe(first.lease);
      expect(
        await rpc("public.finish_notification($1,$2,'sent','stale')", [
          first.id,
          first.lease,
        ]),
      ).toBe(false);
      expect(await rpc("public.claim_notifications()")).toHaveLength(0);
    } finally {
      await pg.exec("rollback; reset role");
    }
  });
  it("queues onboarding only for owners and suppresses revoked memberships", async () => {
    await identity(admin);
    const store = await rpc("public.create_tenant('New owner store',$1)", [
      owner,
    ]);
    await pg.exec("reset role; set role service_role");
    const jobs = await rpc("public.claim_notifications()");
    expect(jobs).toHaveLength(1);
    expect(jobs[0]).toMatchObject({
      kind: "store_owner_onboarding",
      user_id: owner,
      tenant_id: store,
    });
    expect(
      await rpc("public.notification_authorized($1,$2)", [
        jobs[0].id,
        jobs[0].lease,
      ]),
    ).toBe(true);
    await identity(admin);
    await rpc("public.setup_tenant_inventory($1,'status',$2)", [
      store,
      { active: false },
    ]);
    await pg.exec("reset role; set role service_role");
    expect(
      await rpc("public.notification_authorized($1,$2)", [
        jobs[0].id,
        jobs[0].lease,
      ]),
    ).toBe(false);
    await rpc("public.finish_notification($1,$2,'suppressed',null)", [
      jobs[0].id,
      jobs[0].lease,
    ]);
  });
  it("deduplicates daily low-stock reports and excludes other tenants and viewers", async () => {
    await identity(owner);
    await movement("release", 5);
    await movement("adjust", -7);
    await pg.exec("reset role; set role service_role");
    expect(await rpc("public.queue_low_inventory_reports(current_date)")).toBe(
      1,
    );
    expect(await rpc("public.queue_low_inventory_reports(current_date)")).toBe(
      0,
    );
    const jobs = await rpc("public.claim_notifications()");
    expect(jobs).toHaveLength(1);
    expect(jobs[0]).toMatchObject({
      kind: "low_inventory_report",
      tenant_id: tenant,
      user_id: owner,
      context: { store: "First store", lowStockCount: 1 },
    });
    expect(jobs[0].context.items[0]).toMatchObject({
      sku: "RIWAY-001",
      available: 3,
    });
  });
});

describe("Clerk UUID identity bridge", () => {
  it("rejects unknown issuers and maps first login to a stable private UUID", async () => {
    await identity("user_sandbox", {
      iss: "https://sandbox.clerk.accounts.dev",
      fva: [1, 1],
    });
    await expect(rpc("public.ensure_clerk_profile()")).rejects.toThrow(
      "Untrusted identity",
    );
    await pg.exec(
      "reset role; insert into private.clerk_issuers values('https://sandbox.clerk.accounts.dev')",
    );
    await identity("user_sandbox", {
      iss: "https://sandbox.clerk.accounts.dev",
      fva: [1, 1],
    });
    const id = await rpc("public.ensure_clerk_profile()");
    expect(await rpc("public.ensure_clerk_profile()")).toBe(id);
    expect(
      (await pg.query<{ id: string }>("select id from public.profiles")).rows,
    ).toEqual([{ id }]);
    expect(await rpc("public.is_platform_admin()")).toBe(false);
    await expect(
      pg.exec("select * from private.clerk_identities"),
    ).rejects.toThrow(/permission denied/);
  });
  it("prevents stale MFA and disables deleted identities even with an old token", async () => {
    const claims = { iss: "https://sandbox.clerk.accounts.dev", fva: [1, 16] };
    await identity("user_sandbox", claims);
    expect(await rpc("private.mfa_verified()")).toBe(false);
    await pg.exec("reset role; set role service_role");
    await rpc(
      "public.disable_clerk_identity('https://sandbox.clerk.accounts.dev','user_sandbox')",
    );
    await identity("user_sandbox", { ...claims, fva: [1, 1] });
    expect((await pg.query("select * from public.profiles")).rows).toHaveLength(
      0,
    );
    await expect(rpc("public.ensure_clerk_profile()")).rejects.toThrow(
      "Identity disabled",
    );
  });
});
