import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { authenticatorQr } from "../../src/lib/authenticator-qr";
import { AuthenticatorQr } from "../../src/components/authenticator-qr";

// RFC 6238's public test secret, never a real user's enrollment.
const secret = "GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ";
const uri = `otpauth://totp/RIWAY:fixture%40example.invalid?secret=${secret}&issuer=RIWAY`;
describe("authenticator QR enrollment", () => {
  it("renders an inline QR with an opaque background and four-module quiet zone", () => {
    const qr = authenticatorQr(uri);
    const markup = renderToStaticMarkup(<AuthenticatorQr qr={qr} />);
    expect(qr.secret).toBe(secret);
    expect(qr.size).toBeGreaterThan(21);
    expect(markup).toContain('role="img"');
    expect(markup).toContain('shape-rendering="crispEdges"');
    expect(markup).toContain(
      `<rect width="${qr.size}" height="${qr.size}" fill="#fff"`,
    );
    expect(markup).not.toMatch(/<img|data:image|<image|href=/);
    for (const match of qr.path.matchAll(/M(\d+) (\d+)h1v1h-1z/g)) {
      expect(Number(match[1])).toBeGreaterThanOrEqual(4);
      expect(Number(match[2])).toBeGreaterThanOrEqual(4);
      expect(Number(match[1])).toBeLessThan(qr.size - 4);
      expect(Number(match[2])).toBeLessThan(qr.size - 4);
    }
    expect(qr.path.match(/M/g)?.length).toBeGreaterThan(100);
  });
  it.each([
    "",
    "https://example.invalid/qr",
    "otpauth://hotp/account?secret=ABC234",
    "otpauth://totp/account",
    "otpauth://totp/account?secret=invalid-0",
  ])("rejects invalid enrollment data", (value) => {
    expect(() => authenticatorQr(value)).toThrow();
  });
});
