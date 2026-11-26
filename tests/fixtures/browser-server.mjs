// Disposable UI fixture: real migration/RLS/RPC execution in PGlite, with a
// deliberately synthetic Auth/REST HTTP boundary. NEVER a provider-auth pass.
// No hosted database, secret, gateway, email service or real account is used.
import { PGlite } from "@electric-sql/pglite";
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { createServer } from "node:http";
import { spawn } from "node:child_process";
import { resolve, dirname, extname, isAbsolute } from "node:path";
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";
import { build } from "esbuild";
import { createManualSandbox } from "./manual-sandbox.mjs";
import {
  onlineSandboxSettings,
  startOnlineGateway,
} from "./online-sandbox-gateway.mjs";
const root = resolve(import.meta.dirname, "../..");
const online = process.argv.includes("--online")
  ? onlineSandboxSettings()
  : null;
const manual = online || process.argv.includes("--manual");
const appPort = online?.appPort ?? 4174;
const fixturePort = online?.fixturePort ?? 4682;
const fixtureHost = `127.0.0.1:${fixturePort}`;
const fixtureOrigin = `http://${fixtureHost}`;
if (!manual && process.env.RIWAY_DISPOSABLE_BROWSER !== "1")
  throw new Error(
    "Set RIWAY_DISPOSABLE_BROWSER=1 to start the isolated fixture.",
  );
const voiceHarness = await build({
  absWorkingDir: root,
  entryPoints: [resolve(root, "tests/fixtures/assistant-voice.tsx")],
  tsconfig: resolve(root, "tsconfig.json"),
  preserveSymlinks: true,
  bundle: true,
  write: false,
  platform: "browser",
  format: "iife",
  define: { "process.env.NODE_ENV": '"production"' },
  alias: { "next/link": resolve(root, "tests/fixtures/harness-link.tsx") },
  // Resolve/read with the same Node host as the fixture. The esbuild binary
  // otherwise scans inaccessible parent directories on restricted Windows.
  plugins: [
    {
      name: "fixture-source-reader",
      setup(builder) {
        builder.onResolve({ filter: /.*/ }, (args) => {
          let name = args.path;
          if (name === "next/link")
            name = resolve(root, "tests/fixtures/harness-link.tsx");
          if (name.startsWith("@/")) name = resolve(root, "src", name.slice(2));
          let path;
          if (isAbsolute(name) || name.startsWith(".")) {
            const base = isAbsolute(name)
              ? name
              : resolve(args.importer ? dirname(args.importer) : root, name);
            path = [base, base + ".ts", base + ".tsx", base + ".js"].find(
              (candidate) => existsSync(candidate),
            );
            if (!path) throw new Error("Fixture source not found: " + name);
          } else
            path = createRequire(
              args.importer || resolve(root, "package.json"),
            ).resolve(name);
          return { path, namespace: "fixture-source" };
        });
        builder.onLoad(
          { filter: /.*/, namespace: "fixture-source" },
          (args) => ({
            contents: readFileSync(args.path, "utf8"),
            loader:
              extname(args.path) === ".tsx"
                ? "tsx"
                : extname(args.path) === ".ts"
                  ? "ts"
                  : "js",
          }),
        );
      },
    },
  ],
});
const pg = new PGlite();
await pg.exec(
  readFileSync(resolve(root, "tests/security/local-bootstrap.sql"), "utf8"),
);
for (const file of readdirSync(resolve(root, "supabase/migrations"))
  .filter((n) => n.endsWith(".sql"))
  .sort())
  await pg.exec(
    readFileSync(resolve(root, "supabase/migrations", file), "utf8"),
  );
export const users = {
  customer: "81000000-0000-4000-8000-000000000001",
  distributor: "81000000-0000-4000-8000-000000000002",
  editor: "81000000-0000-4000-8000-000000000003",
  reviewer: "81000000-0000-4000-8000-000000000004",
  memberDesktop: "81000000-0000-4000-8000-000000000005",
  memberMobile: "81000000-0000-4000-8000-000000000006",
  ...(manual && {
    manualBuyer: "81000000-0000-4000-8000-000000000007",
    manualSgStaff: "81000000-0000-4000-8000-000000000008",
    guest: "81000000-0000-4000-8000-000000000009",
  }),
};
await pg.exec(`insert into auth.users(id,email,email_confirmed_at)values ${Object.entries(
  users,
)
  .map(([name, id]) => `('${id}','${name}@example.invalid',now())`)
  .join(",")};
 insert into public.staff_roles(user_id,market,role)values('${users.editor}','PH','editor'),('${users.reviewer}','PH','admin'),('${users.reviewer}','PH','compliance');
 insert into public.distributor_profiles(user_id,external_member_id,code,display_name,market,active,verified_at)values('${users.distributor}','QA-BROWSER','QAFIXTURE','Synthetic browser distributor','PH',true,now());
 insert into private.consultation_slots(id,distributor_id,starts_at,ends_at,timezone)values
 ('82000000-0000-4000-8000-000000000001','${users.distributor}',now()+interval '2 days',now()+interval '2 days 1 hour','UTC'),
 ('82000000-0000-4000-8000-000000000002','${users.distributor}',now()+interval '3 days',now()+interval '3 days 1 hour','UTC');
 insert into public.content_entries(id,slug,kind,title,body,market,starts_at,status)values('83000000-0000-4000-8000-000000000001','synthetic-event','event','Synthetic browser event','Synthetic event used only in a disposable local database.','PH',now()+interval '5 days','published'),('83000000-0000-4000-8000-000000000002','synthetic-event-mobile','event','Synthetic mobile browser event','Synthetic event used only in a disposable local database.','PH',now()+interval '5 days','published');`);
await pg.exec(`insert into public.products(id,slug,name,category,status)values
 ('84000000-0000-4000-8000-000000000001','synthetic-qualifier-desktop','Synthetic qualifying goods','Nutrition','published'),
 ('84000000-0000-4000-8000-000000000002','synthetic-gift-desktop','Synthetic gift goods','Nutrition','published'),
 ('84000000-0000-4000-8000-000000000003','synthetic-qualifier-mobile','Synthetic mobile qualifying goods','Nutrition','published'),
 ('84000000-0000-4000-8000-000000000004','synthetic-gift-mobile','Synthetic mobile gift goods','Nutrition','published');
 insert into public.product_offers(product_id,market,currency,retail_minor,regulatory_approved,approval_reference,max_quantity)
 select id,'PH','PHP',100,true,'SYNTHETIC-DISPOSABLE',24 from public.products where slug like 'synthetic-%';
 insert into public.inventory(product_id,market,on_hand)select id,'PH',10 from public.products where slug like 'synthetic-%';`);
const identifier = (value) => {
  if (!/^[a-z_][a-z0-9_]*$/.test(value))
    throw new Error("Invalid fixture identifier");
  return '"' + value + '"';
};
// Synthetic multilingual content. Publication is still checked by the actual
// database triggers; no text is inserted into a hosted content store.
await pg.exec(`select set_config('request.jwt.claims','{"sub":"${users.reviewer}","role":"authenticated","aal":"aal2"}',false);
 insert into public.content_entries(slug,kind,title,body,market,status)values
 ('support-contacts','page','Synthetic English contacts','Synthetic English contact information for disposable tests only.','PH','published'),
 ('support-contacts-fil','page','Mga synthetic contact','Synthetic Filipino contact content for disposable tests only.','PH','published'),
 ('support-contacts-ms','page','Hidden synthetic Malay draft','This unpublished Malay draft must not be visible.','PH','draft');
 insert into public.product_market_content(product_id,market,locale,ingredients,status,approval_reference)
 select id,'PH','en','Synthetic approved English ingredients','published','SYNTHETIC-ONLY'from public.products where slug in('synthetic-qualifier-desktop','synthetic-qualifier-mobile');
 select set_config('request.jwt.claims','{}',false);`);
// Two paid orders for the desktop/mobile customer return journeys. Payments
// are simulated through the real settlement RPC inside this disposable DB.
await pg.exec(`insert into public.sponsor_attributions(user_id,distributor_id)values('${users.customer}','${users.distributor}');
 update public.markets set online_sales_approved=true,payments_ready=true,policy_reference='SYNTHETIC-BROWSER'where code='PH';
 do $$declare p uuid;o uuid;q jsonb;r jsonb;begin
 foreach p in array array['84000000-0000-4000-8000-000000000001'::uuid,'84000000-0000-4000-8000-000000000003'::uuid]loop
 perform set_config('request.jwt.claims','{"sub":"${users.customer}","role":"authenticated","aal":"aal1"}',true);
 q:=public.quote_fulfilment_checkout('PH',jsonb_build_array(jsonb_build_object('productId',p,'quantity',1)),null,'{"method":"delivery"}');
 o:=public.create_fulfilment_order('PH',jsonb_build_array(jsonb_build_object('productId',p,'quantity',1)),'{"full_name":"Synthetic customer","phone":"0000000000","line1":"Disposable fixture address","city":"Manila","postal_code":"1000","country":"PH"}',gen_random_uuid(),(select checkout_terms_version from public.markets where code='PH'),null,q->>'quoteHash',null,'{"method":"delivery"}');
 perform set_config('request.jwt.claims','{}',true);
 r:=public.prepare_stripe_checkout(o,'${users.customer}',false,'https://example.invalid');
 perform public.apply_stripe_checkout_event('evt_browser_'||o,(r->>'id')::uuid,o,'cs_test_browser_'||replace(o::text,'-',''),false,100,'php','complete','paid','pi_browser'||replace(o::text,'-',''));
 end loop;end $$;`);
// Seed separate qualifying purchases so the desktop and mobile reviewers
// can each exercise the complete staff confirmation workflow once.
await pg.exec(`
 insert into public.products(id,slug,name,category,status) values
 ('84000000-0000-4000-8000-000000000005','synthetic-membership-package','Synthetic membership package','Packages','published');
 insert into public.product_offers(product_id,market,currency,retail_minor,regulatory_approved,approval_reference,max_quantity)
 values('84000000-0000-4000-8000-000000000005','PH','PHP',500,true,'SYNTHETIC-DISPOSABLE',24);
 do $$
 declare
  buyer uuid;
  order_id uuid;
  draft jsonb;
  offer jsonb;
  qualification jsonb;
  quote jsonb;
  payment jsonb;
  settlement text;
  cart jsonb:='[{"productId":"84000000-0000-4000-8000-000000000005","quantity":1}]';
 begin
  perform set_config('request.jwt.claims','{"sub":"${users.reviewer}","role":"authenticated","aal":"aal2"}',true);
  draft:=public.save_commerce_draft(null,'package','PH','Synthetic membership package','review',
   '{"components":[{"productId":"84000000-0000-4000-8000-000000000001","quantity":1}],"retailMinor":500,"memberMinor":400}',0);
  offer:=public.approve_commerce_draft((draft->>'id')::uuid,1,'84000000-0000-4000-8000-000000000005','SYNTHETIC-BROWSER');
  qualification:=public.approve_membership_rule((offer->>'id')::uuid,'SYNTHETIC_STARTER','Synthetic Starter',1,
   'synthetic-terms','Synthetic terms limited to this disposable workflow.',
   'synthetic-code','Synthetic conduct limited to this disposable workflow.','SYNTHETIC-BROWSER');
  foreach buyer in array array['${users.memberDesktop}'::uuid,'${users.memberMobile}'::uuid] loop
   insert into public.sponsor_attributions(user_id,distributor_id) values(buyer,'${users.distributor}');
   perform set_config('request.jwt.claims',jsonb_build_object('sub',buyer,'role','authenticated','aal','aal1')::text,true);
   quote:=public.quote_fulfilment_checkout('PH',cart,null,'{"method":"delivery"}');
   order_id:=public.create_fulfilment_order('PH',cart,
    '{"full_name":"Synthetic applicant","phone":"0000000000","line1":"Disposable fixture address","city":"Manila","postal_code":"1000","country":"PH"}',
    gen_random_uuid(),(select checkout_terms_version from public.markets where code='PH'),null,quote->>'quoteHash',
    jsonb_build_object('ruleId',qualification->>'id','termsVersion','synthetic-terms','codeVersion','synthetic-code','accepted',true),
    '{"method":"delivery"}');
   perform set_config('request.jwt.claims','{}',true);
   payment:=public.prepare_stripe_checkout(order_id,buyer,false,'https://example.invalid');
   settlement:=public.apply_stripe_checkout_event('evt_membership_'||order_id,(payment->>'id')::uuid,order_id,
    'cs_test_membership_'||replace(order_id::text,'-',''),false,(payment->>'amount')::bigint,payment->>'currency',
    'complete','paid','pi_membership'||replace(order_id::text,'-',''));
   if settlement is distinct from 'paid' then
    raise exception 'Disposable membership settlement failed (%)',settlement;
   end if;
  end loop;
 end $$;
`);
if (manual)
  await pg.query(
    "insert into public.staff_roles(user_id,market,role)values($1,'SG','admin')",
    [users.manualSgStaff],
  );
const manualSandbox = manual
  ? await createManualSandbox(pg, users, online?.origin)
  : null;
const tables = new Set([
  "markets",
  "products",
  "product_offers",
  "content_entries",
  "distributor_profiles",
  "staff_roles",
  "service_centres",
  "event_registrations",
  "profiles",
  "orders",
  "sponsor_attributions",
  "memberships",
  "product_market_content",
  ...(manual
    ? [
        "addresses",
        "support_tickets",
        "inventory",
        "audit_logs",
        "product_recommendations",
        "media_assets",
      ]
    : []),
]);
const rowRpc = new Set([
  "lookup_distributor",
  "lookup_distributor_store",
  "find_distributors",
]);
let sequence = Promise.resolve();
const server = createServer((req, res) => {
  sequence = sequence
    .then(async () => {
      res.setHeader("content-type", "application/json");
      res.setHeader("cache-control", "no-store");
      if (req.headers.host !== fixtureHost) {
        res.writeHead(403).end();
        return;
      }
      const url = new URL(req.url, fixtureOrigin);
      if (manualSandbox && (await manualSandbox(req, res, url))) return;
      if (req.method === "GET" && url.pathname === "/fixture/assistant-voice") {
        res.setHeader("content-type", "text/html; charset=utf-8");
        res.setHeader(
          "content-security-policy",
          "default-src 'self'; script-src 'self'; connect-src 'self'; object-src 'none'; base-uri 'none'",
        );
        res.end(
          '<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>Isolated voice consent test</title><div id="root"></div><script src="/fixture/assistant-voice.js" defer></script></html>',
        );
        return;
      }
      if (
        req.method === "GET" &&
        url.pathname === "/fixture/assistant-voice.js"
      ) {
        res.setHeader("content-type", "application/javascript; charset=utf-8");
        res.end(voiceHarness.outputFiles[0].contents);
        return;
      }
      let user = null;
      try {
        const payload = JSON.parse(
          Buffer.from(
            (req.headers.authorization ?? "")
              .replace("Bearer ", "")
              .split(".")[1] ?? "",
            "base64url",
          ).toString(),
        );
        if (Object.values(users).includes(payload.sub)) user = payload;
      } catch {}
      if (url.pathname === "/auth/v1/user") {
        if (!user) {
          res.writeHead(401);
          res.end(JSON.stringify({ message: "Fixture sign-in required" }));
          return;
        }
        res.end(
          JSON.stringify({
            id: user.sub,
            email:
              Object.keys(users).find((k) => users[k] === user.sub) +
              "@example.invalid",
            aud: "authenticated",
            role: "authenticated",
            email_confirmed_at: "2026-11-25T00:00:00Z",
            app_metadata: { provider: "email", providers: ["email"] },
            user_metadata: {},
            identities: [],
            created_at: "2026-11-25T00:00:00Z",
          }),
        );
        return;
      }
      const parts = [];
      for await (const chunk of req) {
        parts.push(chunk);
        if (parts.reduce((n, b) => n + b.length, 0) > 100000)
          throw new Error("Fixture payload too large");
      }
      const body = parts.length
        ? JSON.parse(Buffer.concat(parts).toString())
        : {};
      const role = user ? "authenticated" : "anon";
      try {
        const result = await pg.transaction(async (tx) => {
          await tx.query("select set_config('request.jwt.claims',$1,true)", [
            JSON.stringify(user ? { sub: user.sub, role, aal: user.aal } : {}),
          ]);
          await tx.exec(`set local role ${role}`);
          if (url.pathname.startsWith("/rest/v1/rpc/")) {
            const rpc = url.pathname.split("/").pop();
            const name = identifier(rpc);
            const keys = Object.keys(body);
            const args = keys
              .map((key, index) => `${identifier(key)}=>$${index + 1}`)
              .join(",");
            const values = keys.map((k) =>
              typeof body[k] === "object" && body[k] !== null
                ? JSON.stringify(body[k])
                : body[k],
            );
            const r = await tx.query(
              rowRpc.has(rpc)
                ? `select coalesce(jsonb_agg(to_jsonb(item)), '[]'::jsonb) as value from public.${name}(${args}) as item`
                : `select public.${name}(${args})as value`,
              values,
            );
            return r.rows[0]?.value ?? null;
          }
          const table = url.pathname.split("/").pop();
          if (!tables.has(table)) throw new Error("Fixture route unavailable");
          if (req.method === "POST" && table === "event_registrations") {
            const keys = Object.keys(body);
            await tx.query(
              `insert into public.${identifier(table)}(${keys.map(identifier).join(",")})values(${keys.map((_, i) => `$${i + 1}`).join(",")})`,
              keys.map((k) => body[k]),
            );
            return null;
          }
          if (req.method === "POST" && table === "product_market_content") {
            const permitted = new Set([
              "product_id",
              "market",
              "locale",
              "ingredients",
              "usage",
              "label_notes",
              "regulatory_statement",
              "video_url",
              "status",
              "approval_reference",
            ]);
            const keys = Object.keys(body);
            if (keys.some((k) => !permitted.has(k)))
              throw Error("Unsupported fixture content write");
            await tx.query(
              `insert into public.product_market_content(${keys.map(identifier).join(",")})values(${keys.map((_, i) => `$${i + 1}`).join(",")})on conflict(product_id,market,locale)do update set ${keys
                .filter((k) => !["product_id", "market", "locale"].includes(k))
                .map((k) => `${identifier(k)}=excluded.${identifier(k)}`)
                .join(",")}`,
              keys.map((k) => body[k]),
            );
            return null;
          }
          const editColumns =
            manual &&
            {
              products: [
                "name",
                "slug",
                "category",
                "subtitle",
                "description",
                "status",
              ],
              content_entries: [
                "slug",
                "kind",
                "title",
                "excerpt",
                "body",
                "story_asset_id",
                "status",
                "market",
                "location",
                "starts_at",
                "image_url",
                "publish_at",
                "unpublish_at",
              ],
              product_offers: [
                "product_id",
                "market",
                "currency",
                "retail_minor",
                "member_minor",
                "max_quantity",
              ],
              support_tickets:
                req.method === "PATCH"
                  ? ["status"]
                  : ["user_id", "subject", "message", "market"],
              profiles: ["id", "full_name", "phone", "marketing_consent"],
              addresses: [
                "user_id",
                "full_name",
                "phone",
                "line1",
                "city",
                "postal_code",
                "country",
              ],
            }[table];
          if (editColumns && ["POST", "PATCH"].includes(req.method)) {
            const keys = Object.keys(body);
            if (!keys.length || keys.some((k) => !editColumns.includes(k)))
              throw new Error("Unsupported fixture write");
            const values = keys.map((k) => body[k]);
            const columns = keys.map(identifier);
            const assignments = columns
              .map((k, i) => k + "=$" + (i + 1))
              .join(",");
            if (req.method === "PATCH") {
              const id = url.searchParams
                .get("id")
                ?.match(/^eq\.([a-f0-9-]{36})$/)?.[1];
              if (
                !id ||
                !["products", "content_entries", "support_tickets"].includes(
                  table,
                )
              )
                throw new Error("Expected a single supported record");
              const result = await tx.query(
                `update public.${identifier(table)} set ${assignments} where id=$${values.length + 1} returning id`,
                [...values, id],
              );
              if (!result.rows.length)
                throw new Error("Record not available to this identity");
              return req.headers.prefer?.includes("return=representation")
                ? result.rows[0]
                : null;
            }
            const unique = {
              product_offers: ["product_id", "market"],
              profiles: ["id"],
            }[table];
            const conflict = unique
              ? " on conflict(" +
                unique.map(identifier).join(",") +
                ") do update set " +
                keys
                  .filter((key) => !unique.includes(key))
                  .map(identifier)
                  .map((column) => column + "=excluded." + column)
                  .join(",")
              : "";
            await tx.query(
              `insert into public.${identifier(table)}(${columns.join(",")})values(${values.map((_, i) => "$" + (i + 1)).join(",")})${conflict}`,
              values,
            );
            return null;
          }
          if (manual && req.method === "DELETE" && table === "addresses") {
            const id = url.searchParams
              .get("id")
              ?.match(/^eq\.([a-f0-9-]{36})$/)?.[1];
            if (
              !id ||
              !user ||
              url.searchParams.get("user_id") !== "eq." + user.sub
            )
              throw new Error("Expected the caller's address");
            await tx.query(
              "delete from public.addresses where id=$1 and user_id=$2",
              [id, user.sub],
            );
            return null;
          }
          if (!["GET", "HEAD"].includes(req.method))
            throw new Error("Fixture method unavailable");
          const columns = url.searchParams.get("select") ?? "*";
          const orderItems =
            table === "orders" && columns === "*,order_items(*)";
          const productName =
            manual &&
            ["inventory", "product_offers"].includes(table) &&
            columns === "*,products(name)";
          if (
            !orderItems &&
            !productName &&
            columns !== "*" &&
            !/^[a-z0-9_,]+$/i.test(columns)
          )
            throw new Error("Nested fixture selection unavailable");
          const values = [];
          const conditions = [];
          const expression = (key, value) => {
            const split = value.indexOf(".");
            const operator = value.slice(0, split),
              argument = value.slice(split + 1);
            const field = identifier(key);
            if (operator === "is" && argument === "null")
              return `${field} is null`;
            if (operator === "in" && /^\([A-Za-z0-9,_-]+\)$/.test(argument)) {
              const placeholders = argument
                .slice(1, -1)
                .split(",")
                .map((value) => {
                  values.push(value);
                  return `$${values.length}`;
                });
              return `${field} in (${placeholders.join(",")})`;
            }
            if (!["eq", "neq"].includes(operator))
              throw new Error("Fixture filter unavailable");
            values.push(argument);
            return `${field}${operator === "eq" ? "=" : "<>"}$${values.length}`;
          };
          for (const [key, value] of url.searchParams) {
            if (["select", "order", "limit", "offset"].includes(key)) continue;
            if (key === "or") {
              conditions.push(
                "(" +
                  value
                    .replace(/^\(|\)$/g, "")
                    .split(",")
                    .map((item) => {
                      const i = item.indexOf(".");
                      return expression(item.slice(0, i), item.slice(i + 1));
                    })
                    .join(" or ") +
                  ")",
              );
            } else conditions.push(expression(key, value));
          }
          const order = (url.searchParams.get("order") ?? "")
            .split(",")
            .filter(Boolean)
            .map((v) => {
              const [k, dir] = v.split(".");
              return identifier(k) + (dir === "desc" ? " desc" : " asc");
            })
            .join(",");
          const limit = Math.min(
            1000,
            Math.max(0, Number(url.searchParams.get("limit") ?? 1000)),
          );
          const offset = Math.max(
            0,
            Number(url.searchParams.get("offset") ?? 0),
          );
          if (!Number.isInteger(limit) || !Number.isInteger(offset))
            throw new Error("Invalid fixture page");
          const source = `from public.${identifier(table)}${conditions.length ? " where " + conditions.join(" and ") : ""}`;
          if (req.method === "HEAD") {
            const {
              rows: [{ count }],
            } = await tx.query(
              `select count(*)::int as count ${source}`,
              values,
            );
            res.setHeader(
              "content-range",
              count ? `0-${count - 1}/${count}` : "*/0",
            );
            return null;
          }
          const sql = `select ${orderItems || productName || columns === "*" ? "*" : columns.split(",").map(identifier).join(",")} ${source}${order ? " order by " + order : ""} limit ${limit} offset ${offset}`;
          const r = await tx.query(sql, values);
          if (orderItems) {
            // Exact allowlisted embedding only; both reads keep caller RLS.
            for (const row of r.rows)
              row.order_items = (
                await tx.query(
                  "select * from public.order_items where order_id=$1",
                  [row.id],
                )
              ).rows;
          }
          if (productName) {
            for (const row of r.rows) {
              row.products =
                (
                  await tx.query(
                    "select name from public.products where id=$1",
                    [row.product_id],
                  )
                ).rows[0] ?? null;
            }
          }
          return req.headers.accept?.includes("vnd.pgrst.object")
            ? (r.rows[0] ?? null)
            : r.rows;
        });
        res.end(JSON.stringify(result));
      } catch (error) {
        res.writeHead(400);
        res.end(
          JSON.stringify({
            code: error.code ?? "FIXTURE",
            message: error.message,
            details: null,
            hint: null,
          }),
        );
      }
    })
    .catch((error) => {
      if (!res.headersSent) res.writeHead(500);
      res.end(JSON.stringify({ message: error.message }));
    });
});
await new Promise((resolve, reject) => {
  server.once("error", reject);
  server.listen(fixturePort, "127.0.0.1", resolve);
});
const gateway = online ? await startOnlineGateway(online) : null;
const next = resolve(root, "node_modules/next/dist/bin/next");
const appOrigin = `http://127.0.0.1:${appPort}`;
const site = online?.origin ?? appOrigin;
const authUrl = online ? site + "/fixture-service" : fixtureOrigin;
const childOptions = {
  cwd: root,
  windowsHide: true,
  stdio: "inherit",
  env: {
    ...process.env,
    ...(online && {
      NODE_OPTIONS: [
        process.env.NODE_OPTIONS,
        "--import=" +
          pathToFileURL(
            resolve(import.meta.dirname, "online-sandbox-fetch.mjs"),
          ).href,
      ]
        .filter(Boolean)
        .join(" "),
    }),
    RIWAY_SANDBOX_ACCESS_CODE: "",
    RIWAY_SANDBOX_ORIGIN: online?.origin ?? "",
    RIWAY_SANDBOX_FIXTURE_PORT: String(fixturePort),
    NEXT_PUBLIC_SUPABASE_URL: authUrl,
    RIWAY_MANUAL_SANDBOX: manual ? "1" : "0",
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "sb_publishable_disposable_fixture",
    NEXT_PUBLIC_SITE_URL: site,
    SITE_URL: site,
    PAYMENT_PROVIDER: "disabled",
    PAYMENT_PROVIDERS: "disabled",
    RIWAY_INTEGRATION: "disabled",
    COMPENSATION_PROVIDER: "disabled",
    SUPABASE_SERVICE_ROLE_KEY: "",
    AUTH_PROVIDER: "supabase",
    AI_ASSISTANT_PROVIDER: "disabled",
    EMAIL_PROVIDER: "disabled",
    STORAGE_PROVIDER: "supabase",
    INVENTORY_PROVIDER: "disabled",
    NEXT_TELEMETRY_DISABLED: "1",
    PAYMENT_WORKER_SECRET: "",
    REFUND_WORKER_SECRET: "",
    NOTIFICATION_WORKER_SECRET: "",
    COMPENSATION_WORKER_SECRET: "",
    NEXT_PUBLIC_GA4_MEASUREMENT_ID: "",
    NEXT_PUBLIC_META_PIXEL_ID: "",
    UI_TRANSLATION_APPROVAL_REFERENCE: "SYNTHETIC-BROWSER-ONLY",
    UI_LOCALES_PH: "en,fil,ms,zh-CN",
    UI_LOCALES_SG: "en",
    UI_LOCALES_MY: "en,ms,zh-CN",
    LOCALIZED_SEO_PATHS: '{"fil":["/shop"]}',
  },
};
let child;
let stopping = false;
async function stop(code = 0) {
  if (stopping) return;
  stopping = true;
  child?.kill();
  gateway?.close();
  server.close();
  await pg.close();
  process.exit(code);
}
process.on("SIGINT", () => void stop());
process.on("SIGTERM", () => void stop());
try {
  // Cold-route compilation in `next dev` can trigger HMR and reload the
  // previous page while a real link navigation is in flight. Build once and
  // exercise the production server so this fixture has no development HMR.
  child = spawn(process.execPath, [next, "build", "--webpack"], childOptions);
  const built = await new Promise((resolve, reject) => {
    child.once("error", reject);
    child.once("exit", (code) => resolve(code));
  });
  if (built !== 0)
    throw new Error("Disposable browser production build failed.");
  child = spawn(
    process.execPath,
    [next, "start", "--hostname", "127.0.0.1", "--port", String(appPort)],
    childOptions,
  );
  child.once("error", (error) => {
    console.error(error);
    void stop(1);
  });
  child.once("exit", (code) => void stop(code ?? 1));
  console.log(
    `Disposable browser fixture API: ${fixtureOrigin}; production app: ${appOrigin}. Auth is synthetic; database RLS/RPCs are real.`,
  );
  if (manual)
    console.log(
      "Open manual sandbox: " +
        (online?.origin ?? fixtureOrigin) +
        "/fixture/manual",
    );
} catch (error) {
  console.error(error);
  await stop(1);
}
