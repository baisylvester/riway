import { PGlite } from "@electric-sql/pglite";
import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { expect, it } from "vitest";

it("upgrades an existing queue without replaying previously attempted or sent messages", async () => {
  const pg = new PGlite();
  const root = resolve(import.meta.dirname, "../..");
  const migration = "20261106060000_notification_activation_window.sql";
  const user = "70000000-0000-4000-8000-000000000001";
  const pending = crypto.randomUUID(),
    expired = crypto.randomUUID(),
    attempted = crypto.randomUUID(),
    sent = crypto.randomUUID();
  try {
    await pg.exec(
      readFileSync(resolve(root, "tests/security/local-bootstrap.sql"), "utf8"),
    );
    for (const file of readdirSync(resolve(root, "supabase/migrations"))
      .filter((file) => file.endsWith(".sql") && file < migration)
      .sort())
      await pg.exec(
        readFileSync(resolve(root, "supabase/migrations", file), "utf8"),
      );
    await pg.query(
      "insert into auth.users(id,email,email_confirmed_at) values($1,'migration@example.invalid',now())",
      [user],
    );
    await pg.query(
      `insert into private.notification_jobs(id,user_id,kind,reference,status,attempts,last_error_code,created_at)
      values($2,$1,'support_received',$2,'pending',0,null,now()-interval '3 days'),
      ($3,$1,'support_received',$3,'failed',0,'expired',now()-interval '3 days'),
      ($4,$1,'support_received',$4,'pending',1,null,now()-interval '3 days'),
      ($5,$1,'support_received',$5,'sent',1,null,now()-interval '3 days')`,
      [user, pending, expired, attempted, sent],
    );
    await pg.exec(
      readFileSync(resolve(root, "supabase/migrations", migration), "utf8"),
    );
    await pg.exec("set role service_role");
    const result = await pg.query<{ jobs: { id: string }[] }>(
      "select public.claim_notifications() as jobs",
    );
    expect(result.rows[0].jobs.map((job) => job.id).sort()).toEqual(
      [pending, expired].sort(),
    );
    await pg.exec("reset role");
    const attemptedResult = await pg.query(
      "select status,first_attempt_at=created_at as original_deadline from private.notification_jobs where id=$1",
      [attempted],
    );
    expect(attemptedResult.rows).toEqual([
      { status: "failed", original_deadline: true },
    ]);
    expect(
      (
        await pg.query(
          "select status from private.notification_jobs where id=$1",
          [sent],
        )
      ).rows,
    ).toEqual([{ status: "sent" }]);
    await pg.exec("set role authenticated");
    await expect(
      pg.query("select public.claim_notifications()"),
    ).rejects.toThrow(/permission denied/);
  } finally {
    await pg.close();
  }
}, 30000);
