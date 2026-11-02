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
    ...config.vars,
    ...process.env,
    CLOUDFLARE_BUILD: "1",
    WRANGLER_LOG_PATH: path.resolve(".cache/wrangler/logs"),
  },
});
process.exit(result.status ?? 1);
