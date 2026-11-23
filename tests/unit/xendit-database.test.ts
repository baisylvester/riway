import { PGlite } from "@electric-sql/pglite";
import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { afterAll, beforeAll, describe, it } from "vitest";

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
describe("xendit payment database", () => {
  it("passes routing, channel, idempotency, webhook ordering, excess payment and isolation acceptance", async () => {
    try {
      await pg.exec(
        readFileSync(resolve(root, "tests/security/xendit.sql"), "utf8"),
      );
    } finally {
      await pg.exec("rollback; reset role;");
    }
  });
});
