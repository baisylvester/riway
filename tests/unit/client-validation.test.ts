import { afterEach, expect, it, vi } from "vitest";
import { runInNewContext, runInThisContext } from "node:vm";
import { clientValidationBootstrap } from "../../src/lib/client-validation";
import { z } from "zod";

const original = { ...z.config() };
afterEach(() => {
  z.config({ ...original, jitless: original.jitless });
  vi.restoreAllMocks();
});

it("disables optional compilation before client schemas are created under a strict CSP", () => {
  runInThisContext(clientValidationBootstrap);
  const compile = vi.spyOn(globalThis, "Function").mockImplementation(() => {
    throw new EvalError("Blocked by CSP");
  });
  const schema = z.object({ quantity: z.number().int().min(1).max(6) });
  expect(schema.safeParse({ quantity: 3 }).success).toBe(true);
  expect(schema.safeParse({ quantity: 25 }).success).toBe(false);
  expect(compile).not.toHaveBeenCalled();
});

it("preserves other Zod settings when the bootstrap runs more than once", () => {
  const context = { __zod_globalConfig: { customSetting: "preserved" } };
  runInNewContext(clientValidationBootstrap, context);
  runInNewContext(clientValidationBootstrap, context);
  expect(context.__zod_globalConfig).toEqual({
    customSetting: "preserved",
    jitless: true,
  });
});
