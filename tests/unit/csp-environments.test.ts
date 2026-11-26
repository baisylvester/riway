import { afterEach, it, expect, vi } from "vitest";
afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
});
it("permits the Next development debugger while excluding eval from production scripts", async () => {
  for (const mode of ["development", "production"]) {
    vi.stubEnv("NODE_ENV", mode);
    vi.resetModules();
    const { default: config } = await import("../../next.config");
    const rules = await (
      config.headers as () => Promise<
        { source: string; headers: { key: string; value: string }[] }[]
      >
    )();
    const policy = rules
      .find((r) => r.source === "/(.*)")!
      .headers.find((h) => h.key === "Content-Security-Policy")!.value;
    expect(policy.includes("'unsafe-eval'")).toBe(mode === "development");
    expect(policy).toContain("object-src 'none'");
    expect(policy).toContain("frame-ancestors 'none'");
  }
});
