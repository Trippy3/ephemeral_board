import { expect, type Page, test } from "@playwright/test";

function newBoardId(): string {
  return `e2e-sync-${Math.random().toString(36).slice(2, 10)}`;
}

async function joinBoard(page: Page, board: string, name: string): Promise<void> {
  await page.goto(`/${board}`);
  await page.fill("#name-input", name);
  await page.click("#name-submit");
  await page.locator("#name-dialog.hidden").waitFor({ state: "attached" });
  await page.locator(".sticky-note").first().waitFor({ state: "visible" });
}

test("CORE INVARIANT: note created in tab A appears in tab B (real-time sync)", async ({
  browser,
}) => {
  const board = newBoardId();
  const ctxA = await browser.newContext();
  const ctxB = await browser.newContext();
  const tabA = await ctxA.newPage();
  const tabB = await ctxB.newPage();

  await joinBoard(tabA, board, "Alice");
  await joinBoard(tabB, board, "Bob");

  const baselineCount = await tabB.locator(".sticky-note").count();

  // Tab A double-clicks on empty board area to create a note.
  // Use a position well below the toolbar and clearly inside the board.
  const boardEl = tabA.locator("#board-container");
  await boardEl.dblclick({ position: { x: 600, y: 400 } });

  await expect
    .poll(() => tabB.locator(".sticky-note").count(), { timeout: 5000 })
    .toBeGreaterThan(baselineCount);

  await ctxA.close();
  await ctxB.close();
});
