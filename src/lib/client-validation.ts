// Runs in the document head before any client bundle constructs Zod schemas.
// Zod 4.4+ supports this bootstrap across all copies of the library. Keep the
// script static: it must never contain user data or configuration secrets.
export const clientValidationBootstrap =
  "globalThis.__zod_globalConfig = Object.assign(globalThis.__zod_globalConfig || {}, { jitless: true });";
