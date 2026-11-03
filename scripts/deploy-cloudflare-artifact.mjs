import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import { parse } from "jsonc-parser";

// Upload an already verified Linux bundle through Cloudflare's official APIs.
// Wrangler manages OAuth; credentials stay in memory and are never printed.
const requireWrangler = createRequire(
  path.resolve("node_modules/wrangler/package.json"),
);
const { hash } = requireWrangler("blake3-wasm");
const config = parse(fs.readFileSync("wrangler.jsonc", "utf8"));
const root = path.resolve(process.argv[2] ?? ".cache/cloudflare-linux");
const account = process.env.CLOUDFLARE_ACCOUNT_ID;
if (!account || !/^[a-f0-9]{32}$/.test(account))
  throw new Error("Set CLOUDFLARE_ACCOUNT_ID to the approved account.");
if (config.name !== "riway-platform")
  throw new Error("Unexpected Worker target.");
const workerFile = path.join(root, ".cloudflare-bundle/worker.js");
const assetsRoot = path.join(root, ".open-next/assets");
if (!fs.existsSync(workerFile) || !fs.existsSync(assetsRoot))
  throw new Error("Verified build artifact is missing.");
const login = spawnSync(
  process.execPath,
  [
    path.resolve("node_modules/wrangler/bin/wrangler.js"),
    "auth",
    "token",
    "--json",
  ],
  {
    encoding: "utf8",
    env: {
      ...process.env,
      WRANGLER_LOG_PATH: path.resolve(".cache/wrangler/logs"),
    },
  },
);
let credentials;
try {
  credentials = JSON.parse(login.stdout);
} catch {
  throw new Error("Sign in with Wrangler first.");
}
if (!credentials.token)
  throw new Error("A Wrangler OAuth or API token is required.");
const base = `https://api.cloudflare.com/client/v4/accounts/${account}`;
async function api(route, options = {}, token = credentials.token) {
  const response = await fetch(base + route, {
    ...options,
    headers: { Authorization: `Bearer ${token}`, ...options.headers },
  });
  const body = await response.json();
  if (!response.ok || !body.success) {
    throw new Error(
      `Cloudflare ${response.status}: ${body.errors?.map((e) => `${e.code}: ${e.message}`).join("; ") ?? "request failed"}`,
    );
  }
  return body.result;
}
function files(directory) {
  return fs
    .readdirSync(directory, { withFileTypes: true })
    .flatMap((entry) =>
      entry.isDirectory()
        ? files(path.join(directory, entry.name))
        : [path.join(directory, entry.name)],
    );
}
function contentType(file) {
  return (
    {
      ".js": "application/javascript",
      ".mjs": "application/javascript",
      ".css": "text/css",
      ".html": "text/html",
      ".json": "application/json",
      ".png": "image/png",
      ".jpg": "image/jpeg",
      ".jpeg": "image/jpeg",
      ".webp": "image/webp",
      ".svg": "image/svg+xml",
      ".txt": "text/plain",
      ".md": "text/markdown",
      ".woff2": "font/woff2",
      ".ico": "image/x-icon",
    }[path.extname(file).toLowerCase()] ?? "application/octet-stream"
  );
}
const manifest = {},
  byHash = new Map();
for (const file of files(assetsRoot)) {
  const relative = path.relative(assetsRoot, file).split(path.sep).join("/");
  if (["_headers", "_redirects", ".assetsignore"].includes(relative)) continue;
  const bytes = fs.readFileSync(file);
  const digest = hash(
    bytes.toString("base64") + path.extname(file).substring(1),
  )
    .toString("hex")
    .slice(0, 32);
  manifest["/" + relative] = { hash: digest, size: bytes.length };
  byHash.set(digest, { bytes, type: contentType(file) });
}
console.log(
  `Preparing ${Object.keys(manifest).length} static assets for ${config.name}.`,
);
const session = await api(
  `/workers/scripts/${config.name}/assets-upload-session`,
  {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ manifest }),
  },
);
let completion = session.jwt;
for (const bucket of session.buckets ?? []) {
  const form = new FormData();
  for (const digest of bucket) {
    const file = byHash.get(digest);
    if (!file) throw new Error("Cloudflare requested an unknown asset.");
    form.append(
      digest,
      new File([file.bytes.toString("base64")], digest, { type: file.type }),
    );
  }
  const result = await api(
    "/workers/assets/upload?base64=true",
    { method: "POST", body: form },
    session.jwt,
  );
  if (result.jwt) completion = result.jwt;
  console.log(`Uploaded ${bucket.length} assets.`);
}
const headersPath = path.join(assetsRoot, "_headers");
const metadata = {
  main_module: "worker.js",
  compatibility_date: config.compatibility_date,
  compatibility_flags: config.compatibility_flags,
  bindings: [
    ...Object.entries(config.vars).map(([name, value]) => ({
      type: "plain_text",
      name,
      text: String(value),
    })),
    { type: "assets", name: "ASSETS" },
    { type: "service", name: "WORKER_SELF_REFERENCE", service: config.name },
  ],
  assets: {
    jwt: completion,
    config: {
      html_handling: "none",
      not_found_handling: "none",
      ...(fs.existsSync(headersPath)
        ? { _headers: fs.readFileSync(headersPath, "utf8") }
        : {}),
    },
  },
  annotations: {
    "workers/message": "RIWAY deployment from verified GitHub Linux build",
  },
};
const form = new FormData();
form.set("metadata", JSON.stringify(metadata));
form.set(
  "worker.js",
  new File([fs.readFileSync(workerFile)], "worker.js", {
    type: "application/javascript+module",
  }),
);
const uploaded = await api(`/workers/scripts/${config.name}`, {
  method: "PUT",
  body: form,
});
console.log(
  "Worker uploaded.",
  JSON.stringify({
    id: uploaded.id,
    deployment_id: uploaded.deployment_id,
    etag: uploaded.etag,
  }),
);
await api(`/workers/scripts/${config.name}/subdomain`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ enabled: config.workers_dev !== false, previews_enabled: config.workers_dev !== false }),
});
console.log("Deployed:", config.vars.NEXT_PUBLIC_SITE_URL);
