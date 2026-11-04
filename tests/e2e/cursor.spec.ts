import { test, expect } from "@playwright/test";

test("cursor follows pointer, exposes drag feedback and clears on release", async ({ page, isMobile }) => {
  await page.goto("/");
  await expect(page.locator("#hero .wheel .item")).toHaveCount(6, { timeout: 20000 });
  const cursor = page.locator(".reference-design .cursor");
  if (isMobile) {
    await expect(cursor).toHaveCount(0);
    return;
  }
  await expect(cursor).toHaveAttribute("aria-hidden", "true");
  await page.mouse.move(300, 200);
  await expect(cursor).toHaveCSS("opacity", "1");
  await expect(cursor.locator(".label")).toHaveText("Drag");
  await page.mouse.down();
  await expect(cursor).toHaveClass(/is-pressed/);
  await expect(cursor).toHaveClass(/is-dragging/);
  await page.mouse.up();
  await expect(cursor).not.toHaveClass(/is-pressed|is-dragging/);
  await page.locator(".reference-design").dispatchEvent("pointerleave");
  await expect(cursor).toHaveCSS("opacity", "0");
});
