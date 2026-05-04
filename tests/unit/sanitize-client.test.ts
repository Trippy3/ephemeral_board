import { describe, expect, it } from "vitest";
import { sanitizeNoteHtml } from "../../public/sanitize.js";

describe("sanitizeNoteHtml (DOMPurify wrapper)", () => {
  // <script>-tag removal is covered by sanitize-server.test.ts (regex layer)
  // and by the ALLOWED_TAGS allowlist below (script is not in the list).
  // Direct <script> input fights with the test DOM environment, so we keep
  // that case in the server-side suite and the upcoming E2E suite.

  it("preserves bold / strong / br / div / span / p", () => {
    const html = "<p>p</p><div>d</div><span>s</span><b>b</b><strong>st</strong><br>";
    const out = sanitizeNoteHtml(html);
    for (const tag of ["<p>", "<div>", "<span>", "<b>", "<strong>"]) {
      expect(out).toContain(tag);
    }
    expect(out.toLowerCase()).toMatch(/<br\s*\/?>/);
  });

  it("strips disallowed tags but KEEP_CONTENT preserves text", () => {
    const out = sanitizeNoteHtml("<i><b>kept</b></i>");
    expect(out).not.toMatch(/<i>/);
    expect(out).toContain("kept");
  });

  it("style attribute: keeps only text-align and font-size", () => {
    const out = sanitizeNoteHtml(
      '<div style="text-align:center;color:red;background:blue;font-size:18px">x</div>',
    );
    expect(out).toMatch(/text-align\s*:\s*center/);
    expect(out).toMatch(/font-size\s*:\s*18px/);
    expect(out).not.toMatch(/color\s*:\s*red/);
    expect(out).not.toMatch(/background/);
  });

  it("style attribute: drops attribute entirely if no allowed rule remains", () => {
    const out = sanitizeNoteHtml('<div style="color:red;background:blue">x</div>');
    expect(out).not.toMatch(/style=/);
    expect(out).toContain("<div");
  });

  it("strips on* handler attributes", () => {
    const out = sanitizeNoteHtml('<div onclick="bad()">x</div>');
    expect(out).not.toMatch(/onclick/i);
  });

  it("strips javascript: URLs", () => {
    const out = sanitizeNoteHtml('<a href="javascript:alert(1)">x</a>');
    expect(out).not.toMatch(/javascript:/i);
  });
});
