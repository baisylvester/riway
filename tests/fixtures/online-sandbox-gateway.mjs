import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { createServer, request } from "node:http";

const cookieName = "__Host-riway-sandbox";
const gatePath = "/sandbox-access";
const consolePath = "/fixture/manual";
const fixtureAuthPaths = new Set([
  "/auth/v1/otp",
  "/auth/v1/verify",
  "/auth/v1/logout",
  "/auth/v1/user",
]);
const digest = (value) => createHash("sha256").update(value).digest();

export function onlineSandboxSettings(env = process.env) {
  const origin = env.RIWAY_SANDBOX_ORIGIN;
  const passphrase = env.RIWAY_SANDBOX_ACCESS_CODE;
  if (!origin || !/^https:\/\/[a-z0-9-]+\.trycloudflare\.com$/.test(origin))
    throw new Error(
      "Set RIWAY_SANDBOX_ORIGIN to the exact HTTPS Quick Tunnel origin.",
    );
  if (!passphrase || !/^[A-Za-z0-9_-]{24,128}$/.test(passphrase))
    throw new Error(
      "Set RIWAY_SANDBOX_ACCESS_CODE to a random access code of at least 24 characters.",
    );
  return { origin, passphrase };
}

export async function startOnlineGateway({ origin, passphrase }) {
  const hostname = new URL(origin).hostname;
  const password = digest(passphrase);
  const session = randomBytes(32).toString("base64url");

  function gate(res, incorrect = false) {
    res.setHeader("Content-Type", "text/html; charset=utf-8");
    res.setHeader(
      "Content-Security-Policy",
      "default-src 'none'; style-src 'unsafe-inline'; form-action 'self'; frame-ancestors 'none'; base-uri 'none'",
    );
    if (incorrect) res.statusCode = 401;
    res.end(`<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width">
      <title>RIWAY sandbox access</title><style>body{font:1rem/1.5 system-ui,sans-serif;max-width:32rem;margin:10vh auto;padding:0 1.25rem;color:#172a20}input,button{font:inherit;margin:.4rem 0 .8rem;display:block;padding:.5rem}button{background:#1d533c;color:white;border:0;border-radius:.25rem}</style>
      <main><h1>RIWAY sandbox access</h1><p>Enter the access code to use the disposable test environment.</p>
      ${incorrect ? '<p role="alert">The access code is incorrect.</p>' : ""}
      <form method="post" action="${gatePath}"><label>Access code<input name="code" type="password" required maxlength="128" autocomplete="current-password"></label><button>Open sandbox</button></form></main></html>`);
  }

  async function handle(req, res) {
    res.setHeader("Cache-Control", "private, no-store");
    res.setHeader("X-Robots-Tag", "noindex, nofollow, noarchive");
    res.setHeader("X-Content-Type-Options", "nosniff");
    // Same-origin form navigations need their Origin header in Chromium.
    res.setHeader("Referrer-Policy", "same-origin");
    if (
      req.headers.host !== hostname ||
      !req.url?.startsWith("/") ||
      req.url.startsWith("//")
    ) {
      res.writeHead(421).end();
      return;
    }
    const url = new URL(req.url, origin);
    const cookies = (req.headers.cookie ?? "").split(/;\s*/);
    const authenticated = cookies.includes(cookieName + "=" + session);
    if (url.pathname === gatePath) {
      if (req.method === "GET") {
        if (authenticated) res.writeHead(303, { Location: consolePath }).end();
        else gate(res);
        return;
      }
      if (
        req.method !== "POST" ||
        req.headers.origin !== origin ||
        req.headers["content-type"]?.split(";")[0] !==
          "application/x-www-form-urlencoded"
      ) {
        res.writeHead(403).end();
        return;
      }
      let body = "";
      for await (const chunk of req) {
        body += chunk.toString();
        if (Buffer.byteLength(body) > 512) {
          res.writeHead(413).end();
          return;
        }
      }
      const given = new URLSearchParams(body).get("code") ?? "";
      if (!timingSafeEqual(digest(given), password)) {
        gate(res, true);
        return;
      }
      res
        .writeHead(303, {
          Location: consolePath,
          "Set-Cookie": `${cookieName}=${session}; Path=/; Max-Age=43200; Secure; HttpOnly; SameSite=Lax`,
        })
        .end();
      return;
    }
    if (!authenticated) {
      if (req.method === "GET" && ["/", consolePath].includes(url.pathname))
        res.writeHead(302, { Location: gatePath }).end();
      else res.writeHead(401).end("Sandbox access required.");
      return;
    }
    if (
      !["GET", "HEAD", "OPTIONS"].includes(req.method) &&
      req.headers.origin !== origin
    ) {
      res.writeHead(403).end();
      return;
    }
    const prefix = "/fixture-service";
    const fixtureApi = url.pathname.startsWith(prefix + "/");
    const fixturePage = url.pathname.startsWith("/fixture/");
    const upstreamPath = fixtureApi
      ? url.pathname.slice(prefix.length)
      : url.pathname;
    if (fixtureApi && !fixtureAuthPaths.has(upstreamPath)) {
      res.writeHead(404).end();
      return;
    }
    const toFixture = fixtureApi || fixturePage;
    const headers = {
      ...req.headers,
      host: toFixture ? "127.0.0.1:4682" : hostname,
      "x-forwarded-host": hostname,
      "x-forwarded-proto": "https",
      "x-forwarded-port": "443",
      cookie: cookies
        .filter((part) => !part.startsWith(cookieName + "="))
        .join("; "),
    };
    // Accept forward metadata from this gateway only. The origin never sees
    // the access-gate cookie or proxy credentials.
    for (const key of [
      "forwarded",
      "x-forwarded-for",
      "proxy-authorization",
      "connection",
      "upgrade",
    ])
      delete headers[key];
    const upstream = request(
      {
        hostname: "127.0.0.1",
        port: toFixture ? 4682 : 4174,
        method: req.method,
        path: upstreamPath + url.search,
        headers,
        timeout: 30_000,
      },
      (reply) => {
        for (const [name, value] of Object.entries(reply.headers)) {
          if (
            value !== undefined &&
            ![
              "cache-control",
              "x-robots-tag",
              "connection",
              "transfer-encoding",
              "referrer-policy",
            ].includes(name)
          )
            res.setHeader(name, value);
        }
        res.writeHead(reply.statusCode ?? 502);
        reply.pipe(res);
      },
    );
    upstream.on("timeout", () => upstream.destroy());
    upstream.on("error", () => {
      if (!res.headersSent)
        res
          .writeHead(503)
          .end("The sandbox is starting or restarting. Try again shortly.");
      else res.destroy();
    });
    res.on("close", () => upstream.destroy());
    req.pipe(upstream);
  }

  const server = createServer({ requestTimeout: 35_000 }, (req, res) => {
    void handle(req, res).catch(() => {
      if (!res.headersSent) res.writeHead(500).end("Sandbox gateway error.");
      else res.destroy();
    });
  });
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(4189, "127.0.0.1", resolve);
  });
  return server;
}
