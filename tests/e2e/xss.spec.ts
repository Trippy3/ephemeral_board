import { expect, test } from "@playwright/test";

function newBoardId(): string {
  return `e2e-xss-${Math.random().toString(36).slice(2, 10)}`;
}

const MALICIOUS_NOTE_MD = (id: string) =>
  [
    "```yaml note",
    `id: ${id}`,
    "type: note",
    "x: 100",
    "y: 200",
    "width: 200",
    "height: 100",
    'color: "#ffffff"',
    'text: "<script>window.__pwned = true;</script>safe-content"',
    "```",
  ].join("\n");

test("CORE INVARIANT: malicious <script> in imported note never executes when rendered", async ({
  page,
  request,
}) => {
  const board = newBoardId();
  const noteId = "xss-target";

  // Seed the board via the import API with a payload that tries to set window.__pwned.
  // sanitize-server.ts strips it; the rendered DOM must not run it.
  const importRes = await request.post(`/api/boards/${board}/import`, {
    data: MALICIOUS_NOTE_MD(noteId),
    headers: { "Content-Type": "text/plain" },
  });
  expect(importRes.status()).toBe(200);

  await page.goto(`/${board}`);
  await page.fill("#name-input", "Tester");
  await page.click("#name-submit");
  await page.locator("#name-dialog.hidden").waitFor({ state: "attached" });
  await page.locator(`#note-${noteId}`).waitFor({ state: "visible" });

  // Give any (would-be) injected script a chance to run.
  await page.waitForTimeout(200);

  const pwned = await page.evaluate(() => (window as unknown as { __pwned?: boolean }).__pwned);
  expect(pwned).toBeUndefined();

  // The benign part of the text must still be visible.
  const noteText = await page.locator(`#note-${noteId} .note-text`).innerText();
  expect(noteText).toContain("safe-content");
});
