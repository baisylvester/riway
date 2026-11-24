import { PGlite } from "@electric-sql/pglite";
import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { afterAll, beforeAll, describe, it } from "vitest";

// Replays every migration in order, then runs each rollback-only acceptance
// suite added for the remaining proposal scope against the real functions,
// constraints and role grants.
const pg = new PGlite();
const root = resolve(import.meta.dirname, "../..");
beforeAll(async () => {
  await pg.exec(
    readFileSync(resolve(root, "tests/security/local-bootstrap.sql"), "utf8"),
  );
  for (const name of readdirSync(resolve(root, "supabase/migrations"))
    .filter((name) => name.endsWith(".sql"))
    .sort())
    await pg.exec(
      readFileSync(resolve(root, "supabase/migrations", name), "utf8"),
    );
}, 60000);

afterAll(async () => {
  await pg.close();
});

const suites = [
  "order_confirmation.sql",
  "compensation.sql",
  "distributor_dashboard.sql",
  "content_integration.sql",
  "email_second_factor.sql",
];

describe("remaining-scope database acceptance", () => {
  for (const suite of suites)
    it(
      suite,
      async () => {
        try {
          await pg.exec(
            readFileSync(resolve(root, "tests/security", suite), "utf8"),
          );
        } finally {
          await pg.exec("rollback; reset role;");
        }
      },
      60000,
    );
});
