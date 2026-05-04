import { describe, expect, it } from "vitest";
import { DEFAULT_ALIGN, DEFAULT_FONT_SIZE } from "../../shared.js";
import {
  assignUserColor,
  bringToFront,
  createNote,
  duplicateNote,
  getBoardSnapshot,
  getOrCreateBoard,
  restoreNote,
} from "../../state.js";

function newBoardId(): string {
  return `test-${Math.random().toString(36).slice(2, 10)}`;
}

describe("state.ts pure-ish behavior", () => {
  it("getOrCreateBoard seeds guide notes deterministically (count + System author)", () => {
    const id = newBoardId();
    const board = getOrCreateBoard(id);
    const notes = Array.from(board.notes.values());
    expect(notes.length).toBeGreaterThan(0);
    for (const n of notes) {
      expect(n.createdBy).toBe("System");
      expect(n.fontSize).toBe(DEFAULT_FONT_SIZE);
      expect(n.align).toBe(DEFAULT_ALIGN);
    }
    const snap = getBoardSnapshot(id);
    expect(snap.notes.length).toBe(notes.length);
  });

  it("createNote: each call gets a unique non-empty id", () => {
    const id = newBoardId();
    const a = createNote(id, { x: 0, y: 0, color: "#fef08a", createdBy: "U" });
    const b = createNote(id, { x: 0, y: 0, color: "#fef08a", createdBy: "U" });
    expect(a.id).not.toBe(b.id);
    expect(a.id.length).toBeGreaterThanOrEqual(8);
    expect(b.id.length).toBeGreaterThanOrEqual(8);
  });

  it("duplicateNote: copies content but mints a NEW id (do not reuse)", () => {
    const id = newBoardId();
    const src = createNote(id, { x: 10, y: 10, color: "#86efac", createdBy: "U" });
    const dup = duplicateNote(
      id,
      {
        text: "<b>hi</b>",
        color: src.color,
        width: src.width,
        height: src.height,
        fontSize: src.fontSize,
        align: src.align,
      },
      { x: 100, y: 100, createdBy: "V" },
    );
    expect(dup.id).not.toBe(src.id);
    expect(dup.text).toBe("<b>hi</b>");
    expect(dup.x).toBe(100);
    expect(dup.createdBy).toBe("V");
  });

  it("restoreNote: PRESERVES id (round-trip / undo invariant)", () => {
    const id = newBoardId();
    const created = createNote(id, { x: 0, y: 0, color: "#fff", createdBy: "U" });
    // Pretend it was deleted, then restored
    const restored = restoreNote(id, { ...created, id: "preserved-id-xyz" });
    expect(restored).not.toBeNull();
    expect(restored?.id).toBe("preserved-id-xyz");
  });

  it("restoreNote: refuses to restore an id that already exists", () => {
    const id = newBoardId();
    const created = createNote(id, { x: 0, y: 0, color: "#fff", createdBy: "U" });
    const result = restoreNote(id, created);
    expect(result).toBeNull();
  });

  it("bringToFront: zIndex strictly increases vs. previous max in board", () => {
    const id = newBoardId();
    const a = createNote(id, { x: 0, y: 0, color: "#fff", createdBy: "U" });
    const b = createNote(id, { x: 0, y: 0, color: "#fff", createdBy: "U" });
    const z = bringToFront(id, a.id);
    expect(z).not.toBeNull();
    expect(z!).toBeGreaterThan(b.zIndex);
  });

  it("assignUserColor: cycles through palette and never returns empty", () => {
    const seen = new Set<string>();
    for (let i = 0; i < 16; i++) {
      const c = assignUserColor();
      expect(c).toMatch(/^#[0-9a-fA-F]{6}$/);
      seen.add(c);
    }
    // At least 2 distinct colors over 16 calls (palette has 8)
    expect(seen.size).toBeGreaterThan(1);
  });
});
