import { describe, expect, it } from "vitest";
import { sanitizeNoteHtmlOnServer } from "../../sanitize-server.js";

describe("sanitizeNoteHtmlOnServer (defense-in-depth)", () => {
  it("returns empty string for non-string input", () => {
    expect(sanitizeNoteHtmlOnServer(null)).toBe("");
    expect(sanitizeNoteHtmlOnServer(undefined)).toBe("");
    expect(sanitizeNoteHtmlOnServer(42)).toBe("");
    expect(sanitizeNoteHtmlOnServer({ x: 1 })).toBe("");
  });

  it("strips <script> open+close pairs", () => {
    const out = sanitizeNoteHtmlOnServer("hello<script>alert(1)</script> world");
    expect(out).not.toMatch(/script/i);
    expect(out).toContain("hello");
    expect(out).toContain("world");
  });

  it("strips dangling <script> tag without close", () => {
    const out = sanitizeNoteHtmlOnServer('<script src="x"> dangling');
    expect(out).not.toMatch(/<\s*script/i);
  });

  it("strips <iframe>", () => {
    expect(sanitizeNoteHtmlOnServer('<iframe src="evil"></iframe>')).not.toMatch(/iframe/i);
  });

  it("strips on* event-handler attributes", () => {
    const out = sanitizeNoteHtmlOnServer('<div onclick="bad()">x</div>');
    expect(out).not.toMatch(/onclick/i);
    expect(out).toContain("<div");
    expect(out).toContain(">x</div>");
  });

  it("strips javascript: URLs", () => {
    const out = sanitizeNoteHtmlOnServer('<a href="javascript:alert(1)">x</a>');
    expect(out).not.toMatch(/javascript:/i);
  });

  it("strips data:text/html URLs", () => {
    const out = sanitizeNoteHtmlOnServer('<a href="data:text/html,<x>">x</a>');
    expect(out).not.toMatch(/data:text\/html/i);
  });

  it("preserves benign content (bold, alignment markup)", () => {
    const safe = '<b>bold</b><div style="text-align:center">c</div>';
    expect(sanitizeNoteHtmlOnServer(safe)).toBe(safe);
  });

  it("caps over-long input to MAX_NOTE_HTML_LENGTH", () => {
    const big = "x".repeat(20_000);
    const out = sanitizeNoteHtmlOnServer(big);
    expect(out.length).toBe(16_000);
  });

  it("handles odd casing / whitespace in tag opener", () => {
    expect(sanitizeNoteHtmlOnServer("<  ScRiPt >a</ script >")).not.toMatch(/script/i);
  });
});
