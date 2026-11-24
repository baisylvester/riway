import { PGlite } from "@electric-sql/pglite";
import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { expect, it } from "vitest";
it("enforces privacy ownership, staff MFA/market isolation, review provenance, state/revision guards, pagination and rollback", async () => {
  const pg = new PGlite();
  const root = resolve(import.meta.dirname, "../..");
  try {
    await pg.exec(
      readFileSync(resolve(root, "tests/security/local-bootstrap.sql"), "utf8"),
    );
    for (const name of readdirSync(resolve(root, "supabase/migrations"))
      .filter((n) => n.endsWith(".sql"))
      .sort())
      await pg.exec(
        readFileSync(resolve(root, "supabase/migrations", name), "utf8"),
      );
    await pg.exec(
      readFileSync(
        resolve(root, "tests/security/privacy_requests.sql"),
        "utf8",
      ),
    );
    expect(
      (
        await pg.query(
          "select count(*)::int as total from private.privacy_requests",
        )
      ).rows,
    ).toEqual([{ total: 0 }]);
    expect(
      (
        await pg.query(
          "select count(*)::int as total from private.privacy_request_events",
        )
      ).rows,
    ).toEqual([{ total: 0 }]);
  } finally {
    await pg.close();
  }
}, 30000);
