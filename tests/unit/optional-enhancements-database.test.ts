import { PGlite } from "@electric-sql/pglite";
import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { it } from "vitest";
it("enforces consultation conflicts, privacy, lifecycle and library publication/version/withdrawal boundaries", async () => {
  const pg = new PGlite();
  const root = resolve(import.meta.dirname, "../..");
  try {
    await pg.exec(
      readFileSync(resolve(root, "tests/security/local-bootstrap.sql"), "utf8"),
    );
    for (const n of readdirSync(resolve(root, "supabase/migrations"))
      .filter((n) => n.endsWith(".sql"))
      .sort())
      await pg.exec(
        readFileSync(resolve(root, "supabase/migrations", n), "utf8"),
      );
    await pg.exec(
      readFileSync(
        resolve(root, "tests/security/consultations_library.sql"),
        "utf8",
      ),
    );
    await pg.exec(
      readFileSync(
        resolve(root, "tests/security/story_event_assistant_privacy.sql"),
        "utf8",
      ),
    );
    await pg.exec(
      readFileSync(
        resolve(root, "tests/security/reorder_reminders.sql"),
        "utf8",
      ),
    );
    await pg.exec(
      readFileSync(
        resolve(root, "tests/security/checkout_collection.sql"),
        "utf8",
      ),
    );
  } finally {
    await pg.close();
  }
}, 60000);
