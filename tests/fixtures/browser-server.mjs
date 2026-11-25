// Disposable UI fixture: real migration/RLS/RPC execution in PGlite, with a
// deliberately synthetic Auth/REST HTTP boundary. NEVER a provider-auth pass.
// No hosted database, secret, gateway, email service or real account is used.
import { PGlite } from "@electric-sql/pglite";
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { createServer } from "node:http";
import { spawn } from "node:child_process";
import { resolve, dirname, extname, isAbsolute } from "node:path";
import { createRequire } from "node:module";
import { build } from "esbuild";
const root = resolve(import.meta.dirname, "../..");
if (process.env.RIWAY_DISPOSABLE_BROWSER !== "1")
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
const identifier = (value) => {
  if (!/^[a-z_][a-z0-9_]*$/.test(value))
    throw new Error("Invalid fixture identifier");
  return '"' + value + '"';
};
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
]);
let sequence = Promise.resolve();
const server = createServer((req, res) => {
  sequence = sequence
    .then(async () => {
      res.setHeader("content-type", "application/json");
      res.setHeader("cache-control", "no-store");
      const url = new URL(req.url, "http://127.0.0.1:4682");
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
            const name = identifier(url.pathname.split("/").pop());
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
              `select public.${name}(${args})as value`,
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
          if (req.method !== "GET")
            throw new Error("Fixture method unavailable");
          const columns = url.searchParams.get("select") ?? "*";
          if (columns !== "*" && !/^[a-z0-9_,]+$/i.test(columns))
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
          const sql = `select ${columns === "*" ? "*" : columns.split(",").map(identifier).join(",")} from public.${identifier(table)}${conditions.length ? " where " + conditions.join(" and ") : ""}${order ? " order by " + order : ""} limit ${limit} offset ${offset}`;
          const r = await tx.query(sql, values);
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
await new Promise((resolve) => server.listen(4682, "127.0.0.1", resolve));
const child = spawn(
  process.execPath,
  [
    resolve(root, "node_modules/next/dist/bin/next"),
    "dev",
    "--webpack",
    "--hostname",
    "127.0.0.1",
    "--port",
    "4174",
  ],
  {
    cwd: root,
    windowsHide: true,
    stdio: "inherit",
    env: {
      ...process.env,
      NEXT_PUBLIC_SUPABASE_URL: "http://127.0.0.1:4682",
      NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "sb_publishable_disposable_fixture",
      NEXT_PUBLIC_SITE_URL: "http://127.0.0.1:4174",
      SITE_URL: "http://127.0.0.1:4174",
      PAYMENT_PROVIDER: "disabled",
      AUTH_PROVIDER: "supabase",
      AI_ASSISTANT_PROVIDER: "disabled",
      EMAIL_PROVIDER: "disabled",
    },
  },
);
console.log(
  "Disposable browser fixture API: http://127.0.0.1:4682; app: http://127.0.0.1:4174. Auth is synthetic; database RLS/RPCs are real.",
);
async function stop() {
  child.kill();
  server.close();
  await pg.close();
  process.exit();
}
process.on("SIGINT", stop);
process.on("SIGTERM", stop);
