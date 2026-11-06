import { createServer } from "node:http";
import { randomBytes, timingSafeEqual } from "node:crypto";
import { readFileSync, writeFileSync, renameSync, existsSync } from "node:fs";
import { resolve } from "node:path";

// Local, temporary setup utility. It accepts only named provider settings and
// never returns or logs credentials. It is not part of the deployed application.
const file = resolve(".env.local");
const csrf = randomBytes(32).toString("hex");
const allowed = new Map([
  ["NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY", "Clerk publishable key"],
  ["CLERK_SECRET_KEY", "Clerk secret key"],
  ["CLERK_ISSUER_URL", "Clerk issuer URL"],
  ["CLERK_WEBHOOK_SIGNING_SECRET", "Clerk webhook signing secret"],
  ["RESEND_API_KEY", "Resend sending key"],
  ["SUPABASE_SERVICE_ROLE_KEY", "Supabase service key"],
  ["STRIPE_SECRET_KEY", "Stripe sandbox/test secret key"],
  [
    "STRIPE_WEBHOOK_SECRET",
    "Stripe test webhook signing secret (leave blank to create a new endpoint)",
  ],
]);
const headers = {
  "Content-Type": "text/html; charset=utf-8",
  "Cache-Control": "no-store",
  "Content-Security-Policy":
    "default-src 'none'; style-src 'unsafe-inline'; form-action 'self'; frame-ancestors 'none'; base-uri 'none'",
  "X-Content-Type-Options": "nosniff",
  "Referrer-Policy": "same-origin",
};
function page(message = "") {
  return `<!doctype html><html lang="en"><meta charset="utf-8"><title>RIWAY local provider setup</title><style>body{font:16px system-ui;max-width:680px;margin:40px auto;padding:20px}label{display:block;margin:20px 0}input{display:block;width:100%;padding:10px;box-sizing:border-box}button{padding:12px 24px}p{line-height:1.5}</style><h1>RIWAY local provider setup</h1><p>Credentials are saved only in this project's ignored .env.local. Blank fields preserve existing values. Provider flags remain disabled until verification. R2 is deferred.</p><p role="status">${message}</p><form method="post" action="/save"><input type="hidden" name="csrf" value="${csrf}">${[...allowed].map(([key, label]) => `<label>${label}<input name="${key}" type="${key === "CLERK_ISSUER_URL" ? "url" : "password"}" autocomplete="off" maxlength="4096"></label>`).join("")}<button>Save credentials locally</button></form></html>`;
}
const server = createServer(async (request, response) => {
  const host = `127.0.0.1:${server.address().port}`;
  if (request.headers.host !== host) {
    response.writeHead(403);
    response.end();
    return;
  }
  if (request.method === "GET" && request.url === "/") {
    response.writeHead(200, headers);
    response.end(page());
    return;
  }
  if (
    request.method !== "POST" ||
    request.url !== "/save" ||
    request.headers.origin !== `http://${host}` ||
    !request.headers["content-type"]?.startsWith(
      "application/x-www-form-urlencoded",
    )
  ) {
    response.writeHead(403);
    response.end();
    return;
  }
  let body = "";
  for await (const chunk of request) {
    body += chunk;
    if (Buffer.byteLength(body) > 32768) {
      response.writeHead(413);
      response.end();
      request.destroy();
      return;
    }
  }
  const fields = new URLSearchParams(body),
    received = Buffer.from(fields.get("csrf") || ""),
    expected = Buffer.from(csrf);
  if (
    received.length !== expected.length ||
    !timingSafeEqual(received, expected)
  ) {
    response.writeHead(403);
    response.end();
    return;
  }
  const values = [...allowed.keys()]
    .map((key) => [key, (fields.get(key) || "").trim()])
    .filter(([, value]) => value);
  if (values.some(([, value]) => /[\r\n\0]/.test(value))) {
    response.writeHead(400, headers);
    response.end(page("Invalid setting format."));
    return;
  }
  if (
    values.some(
      ([key, value]) =>
        (key === "CLERK_ISSUER_URL" &&
          !/^https:\/\/[A-Za-z0-9.-]+$/.test(value)) ||
        (key === "RESEND_API_KEY" && !value.startsWith("re_")) ||
        (key === "STRIPE_SECRET_KEY" &&
          !/^(sk|rk)_test_[A-Za-z0-9]+$/.test(value)) ||
        (key === "STRIPE_WEBHOOK_SECRET" &&
          !/^whsec_[A-Za-z0-9]+$/.test(value)) ||
        (key === "CLERK_SECRET_KEY" && !value.startsWith("sk_test_")) ||
        (key === "NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY" &&
          !value.startsWith("pk_test_")),
    )
  ) {
    response.writeHead(400, headers);
    response.end(
      page("Use this application's development keys and exact HTTPS issuer."),
    );
    return;
  }
  try {
    let text = existsSync(file) ? readFileSync(file, "utf8") : "";
    const updates = new Map(values);
    if (!/^NOTIFICATION_WORKER_SECRET=.+$/m.test(text))
      updates.set(
        "NOTIFICATION_WORKER_SECRET",
        randomBytes(32).toString("hex"),
      );
    if (!/^PAYMENT_WORKER_SECRET=.+$/m.test(text))
      updates.set("PAYMENT_WORKER_SECRET", randomBytes(32).toString("hex"));
    for (const [key, value] of updates) {
      const line = `${key}=${JSON.stringify(value)}`;
      const pattern = new RegExp(`^${key}=.*$`, "m");
      text = pattern.test(text)
        ? text.replace(pattern, () => line)
        : text.trimEnd() + "\n" + line + "\n";
    }
    const temp = file + ".setup-tmp";
    writeFileSync(temp, text, { mode: 0o600 });
    renameSync(temp, file);
    console.log(`Saved ${values.length} provider setting(s); values redacted.`);
    response.writeHead(200, headers);
    response.end(page("Credentials saved locally. Values are not displayed."));
  } catch {
    response.writeHead(500, headers);
    response.end(
      page("Settings could not be saved. Check local file permissions."),
    );
  }
});
server.listen(0, "127.0.0.1", () =>
  console.log(`Local RIWAY setup: http://127.0.0.1:${server.address().port}`),
);
const timer = setTimeout(() => server.close(), 15 * 60 * 1000);
timer.unref();
process.on("SIGINT", () => server.close());
