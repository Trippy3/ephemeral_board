import { describe, expect, it } from "vitest";
import { exportAsMarkdown } from "../../export.js";
import { parseMarkdownImport } from "../../import.js";
import {
  createConnector,
  createFrame,
  createNote,
  deleteNote,
  editNote,
  formatNote,
  getBoardSnapshot,
  replaceBoard,
  resizeNote,
} from "../../state.js";

function newBoardId(): string {
  return `it-rt-${Math.random().toString(36).slice(2, 10)}`;
}

describe("Markdown export → import round-trip (CORE INVARIANT #1)", () => {
  it("preserves note id, position, size, color, font format, and text", () => {
    const src = newBoardId();
    const n = createNote(src, { x: 100, y: 200, color: "#fef08a", createdBy: "Alice" });
    editNote(src, n.id, "<b>hello</b><div>world</div>");
    formatNote(src, n.id, { fontSize: 18, align: "center" });
    resizeNote(src, n.id, 250, 150);

    const md = exportAsMarkdown(src);
    const parsed = parseMarkdownImport(md);

    const dst = newBoardId();
    replaceBoard(dst, parsed);
    const snap = getBoardSnapshot(dst);
    const restored = snap.notes.find((x) => x.id === n.id);
    expect(restored).toBeDefined();
    expect(restored?.id).toBe(n.id);
    expect(Math.round(restored!.x)).toBe(100);
    expect(Math.round(restored!.y)).toBe(200);
    expect(restored?.width).toBe(250);
    expect(restored?.height).toBe(150);
    expect(restored?.color).toBe("#fef08a");
    expect(restored?.fontSize).toBe(18);
    expect(restored?.align).toBe("center");
    expect(restored?.text).toBe("<b>hello</b><div>world</div>");
    expect(restored?.createdBy).toBe("Alice");
  });

  it("preserves connector id, sides, shape, style", () => {
    const src = newBoardId();
    const a = createNote(src, { x: 0, y: 0, color: "#ffffff", createdBy: "U" });
    const b = createNote(src, { x: 600, y: 0, color: "#ffffff", createdBy: "U" });
    const c = createConnector(src, {
      fromNoteId: a.id,
      toNoteId: b.id,
      fromSide: "right",
      toSide: "left",
      shape: "elbow",
      style: "arrow",
      color: "#0000ff",
    });
    expect(c).not.toBeNull();

    const md = exportAsMarkdown(src);
    const parsed = parseMarkdownImport(md);
    const dst = newBoardId();
    replaceBoard(dst, parsed);
    const snap = getBoardSnapshot(dst);
    const restored = snap.connectors.find((x) => x.id === c?.id);
    expect(restored).toBeDefined();
    expect(restored?.fromNoteId).toBe(a.id);
    expect(restored?.toNoteId).toBe(b.id);
    expect(restored?.fromSide).toBe("right");
    expect(restored?.toSide).toBe("left");
    expect(restored?.shape).toBe("elbow");
    expect(restored?.style).toBe("arrow");
    expect(restored?.color).toBe("#0000ff");
  });

  it("preserves frame id, position, size, title", () => {
    const src = newBoardId();
    const f = createFrame(src, {
      x: 50,
      y: 60,
      width: 700,
      height: 500,
      color: "#888888",
      title: "Section A",
    });
    const md = exportAsMarkdown(src);
    const dst = newBoardId();
    replaceBoard(dst, parseMarkdownImport(md));
    const restored = getBoardSnapshot(dst).frames.find((x) => x.id === f.id);
    expect(restored).toBeDefined();
    expect(Math.round(restored!.x)).toBe(50);
    expect(Math.round(restored!.y)).toBe(60);
    expect(restored?.title).toBe("Section A");
  });

  it("orphan-prunes connectors whose endpoint was deleted before export", () => {
    const src = newBoardId();
    const a = createNote(src, { x: 0, y: 0, color: "#fff", createdBy: "U" });
    const b = createNote(src, { x: 100, y: 0, color: "#fff", createdBy: "U" });
    createConnector(src, {
      fromNoteId: a.id,
      toNoteId: b.id,
      fromSide: "right",
      toSide: "left",
      style: "arrow",
      color: "#000000",
    });
    // delete b — its connector is cascade-removed at delete time
    deleteNote(src, b.id);

    const md = exportAsMarkdown(src);
    const parsed = parseMarkdownImport(md);
    expect(parsed.connectors).toHaveLength(0);
  });

  it("HTML formatting (b, div with text-align style) survives the round-trip", () => {
    const src = newBoardId();
    const n = createNote(src, { x: 0, y: 0, color: "#ffffff", createdBy: "U" });
    editNote(src, n.id, '<b>bold</b><div style="text-align:center">centered</div>');
    const md = exportAsMarkdown(src);
    const dst = newBoardId();
    replaceBoard(dst, parseMarkdownImport(md));
    const restored = getBoardSnapshot(dst).notes.find((x) => x.id === n.id);
    expect(restored?.text).toContain("<b>bold</b>");
    expect(restored?.text).toMatch(/text-align:\s*center/);
    expect(restored?.text).toContain("centered");
  });
});
