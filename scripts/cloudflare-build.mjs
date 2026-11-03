import { spawnSync } from "node:child_process";
import path from "node:path";
import fs from "node:fs";
import { parse } from 'jsonc-parser';

const cli = path.resolve(
  "node_modules/@opennextjs/cloudflare/dist/cli/index.js",
);
const config = parse(fs.readFileSync("wrangler.jsonc", "utf8"));
const result = spawnSync(process.execPath, [cli, "build"], {
  stdio: "inherit",
  env: {
    ...process.env,
    // Use the same public values at build time and runtime. Empty CI variables
    // must not replace these with empty strings in Next.js browser/server code.
    ...config.vars,
    CLOUDFLARE_BUILD: "1",
    WRANGLER_LOG_PATH: path.resolve(".cache/wrangler/logs"),
  },
});
process.exit(result.status ?? 1);
