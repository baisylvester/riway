import { PGlite } from "@electric-sql/pglite";
import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

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
  it("runs against an existing market routing row and rolls the original configuration back intact", async () => {
    await pg.exec(`insert into private.xendit_market_accounts(market,livemode,account_type,sub_account_id,account_status,enabled_channels,payments_enabled)
      values('PH',false,'OWNED','existing_account_0001','LIVE','{PAYMAYA}',false);`);
    const query =
      "select to_jsonb(a) as routing from private.xendit_market_accounts a where market='PH' and not livemode";
    const before = await pg.query(query);
    try {
      await pg.exec(
        readFileSync(resolve(root, "tests/security/xendit.sql"), "utf8"),
      );
      expect((await pg.query(query)).rows).toEqual(before.rows);
    } finally {
      await pg.exec(
        "rollback; reset role; delete from private.xendit_market_accounts where market='PH' and not livemode;",
      );
    }
  });
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
