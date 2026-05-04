import { expect, test } from "@playwright/test";

function newBoardId(): string {
  return `e2e-dark-${Math.random().toString(36).slice(2, 10)}`;
}

test("CORE INVARIANT: a note created with the black palette color gets the .dark class", async ({
  page,
}) => {
  const board = newBoardId();
  await page.goto(`/${board}`);
  await page.fill("#name-input", "Tester");
  await page.click("#name-submit");
  await page.locator("#name-dialog.hidden").waitFor({ state: "attached" });
  await page.locator(".sticky-note").first().waitFor({ state: "visible" });

  const baselineCount = await page.locator(".sticky-note").count();

  // Pick the black palette color, then create a note via dblclick on empty area.
  await page.locator('.color-btn[data-color="#1f2937"]').click();
  await page.locator("#board-container").dblclick({ position: { x: 600, y: 500 } });

  // A new note appeared
  await expect
    .poll(() => page.locator(".sticky-note").count(), { timeout: 5000 })
    .toBeGreaterThan(baselineCount);

  // The most recently created note (highest zIndex) should be the black one.
  // We rely on color attribute rather than ordering to avoid flakiness.
  const darkNote = page.locator('.sticky-note[data-color="#1f2937"]').first();
  await expect(darkNote).toBeVisible();
  await expect(darkNote).toHaveClass(/\bdark\b/);
});
