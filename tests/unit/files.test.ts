import { expect, it } from "vitest";
import { imageExtension } from "../../src/lib/files";
it("rejects script payloads disguised as images", () => {
  expect(
    imageExtension(new TextEncoder().encode('<svg onload="alert(1)"></svg>')),
  ).toBeNull();
  expect(imageExtension(new Uint8Array([]))).toBeNull();
});
it("recognizes supported image signatures", () => {
  expect(
    imageExtension(new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10])),
  ).toBe("png");
  expect(imageExtension(new Uint8Array([255, 216, 255]))).toBe("jpg");
  expect(imageExtension(new TextEncoder().encode("RIFF0000WEBP"))).toBe("webp");
});
