import { describe, expect, it } from "vitest";
import { authenticatorQrSource } from "../../src/lib/authenticator-qr";

const svg =
  '<svg xmlns="http://www.w3.org/2000/svg" width="220" height="220"><path fill="#000" d="M0 0h20v20H0z"/></svg>';
describe("authenticator QR images", () => {
  it.each([
    svg,
    `data:image/svg+xml;utf-8,${svg}`,
    `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`,
    `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`,
  ])("preserves the SVG instead of wrapping an existing data URL", (input) => {
    const source = authenticatorQrSource(input);
    expect(decodeURIComponent(source.slice(source.indexOf(",") + 1))).toBe(svg);
    expect(new URL(source).hash).toBe("");
    expect(source.match(/data:image/g)).toHaveLength(1);
  });
  it("preserves a base64 SVG image", () => {
    const source = `data:image/svg+xml;base64,${Buffer.from(svg).toString("base64")}`;
    expect(authenticatorQrSource(source)).toBe(source);
  });
  it.each([
    "",
    "https://external.example/qr",
    "data:text/html,<script>bad</script>",
    "%invalid",
  ])(
    "rejects unsupported image sources without exposing the payload",
    (input) => {
      expect(() => authenticatorQrSource(input)).toThrow();
    },
  );
});
