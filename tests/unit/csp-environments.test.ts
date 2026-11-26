import { afterEach, it, expect, vi } from "vitest";
afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
});
async function contentSecurityPolicy() {
  vi.resetModules();
  const { default: config } = await import("../../next.config");
  const rules = await config.headers!();
  return rules
    .find((r) => r.source === "/(.*)")!
    .headers.find((h) => h.key === "Content-Security-Policy")!.value;
}
it("permits the Next development debugger while excluding eval from production scripts", async () => {
  for (const mode of ["development", "production"]) {
    vi.stubEnv("NODE_ENV", mode);
    const policy = await contentSecurityPolicy();
    expect(policy.includes("'unsafe-eval'")).toBe(mode === "development");
    expect(policy).toContain("object-src 'none'");
    expect(policy).toContain("frame-ancestors 'none'");
  }
});

it("permits the exact local Auth fixture only in the manual build", async () => {
  const fixture = "http://127.0.0.1:4682";
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", fixture);
  vi.stubEnv("CLOUDFLARE_BUILD", "0");
  vi.stubEnv("RIWAY_MANUAL_SANDBOX", "0");
  expect(await contentSecurityPolicy()).not.toContain(fixture);
  vi.stubEnv("RIWAY_MANUAL_SANDBOX", "1");
  expect(await contentSecurityPolicy()).toContain(fixture);
  vi.stubEnv("CLOUDFLARE_BUILD", "1");
  expect(await contentSecurityPolicy()).not.toContain(fixture);
});
