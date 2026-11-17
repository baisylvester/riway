import { PGlite } from "@electric-sql/pglite";
import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { afterAll, beforeAll, describe, it } from "vitest";

// Executes the real migrations, functions, constraints and role permissions.
const pg = new PGlite();
const root = resolve(import.meta.dirname, "../..");
beforeAll(async () => {
  await pg.exec(
    readFileSync(resolve(root, "tests/security/local-bootstrap.sql"), "utf8"),
  );
  for (const name of readdirSync(resolve(root, "supabase/migrations"))
    .filter((name) => name.endsWith(".sql"))
    .sort()) {
    await pg.exec(
      readFileSync(resolve(root, "supabase/migrations", name), "utf8"),
    );
  }
}, 30000);

afterAll(async () => {
  await pg.close();
});

describe("sales reporting database", () => {
  it("reports settled sales by market, product, package and distributor within staff scope", async () => {
    try {
      await pg.exec(
        readFileSync(resolve(root, "tests/security/reports.sql"), "utf8"),
      );
    } finally {
      await pg.exec("rollback; reset role;");
    }
  });
});
