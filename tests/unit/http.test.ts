import { it, expect } from "vitest";
import { sameOrigin } from "../../src/lib/http";
it("accepts the incoming authority when Next normalizes the internal URL", () => {
  expect(
    sameOrigin(
      new Request("http://localhost:4173/api/market", {
        headers: { host: "127.0.0.1:4173", origin: "http://127.0.0.1:4173" },
      }),
    ),
  ).toBe(true);
});
it("rejects absent, cross-site and forged origins", () => {
  expect(sameOrigin(new Request("https://riway.example/api/market"))).toBe(
    false,
  );
  expect(
    sameOrigin(
      new Request("https://riway.example/api/market", {
        headers: { host: "riway.example", origin: "https://evil.example" },
      }),
    ),
  ).toBe(false);
  expect(
    sameOrigin(
      new Request("https://riway.example/api/market", {
        headers: {
          host: "riway.example",
          origin: "https://riway.example",
          "sec-fetch-site": "cross-site",
        },
      }),
    ),
  ).toBe(false);
});
