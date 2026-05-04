import { describe, expect, it } from "vitest";
import {
  bringToFront,
  createConnector,
  createFrame,
  createNote,
  deleteNote,
  editNote,
  formatNote,
  getBoardSnapshot,
  replaceBoard,
} from "../../state.js";

function newBoardId(): string {
  return `it-state-${Math.random().toString(36).slice(2, 10)}`;
}

describe("state.ts behavior contracts", () => {
  it("deleteNote returns removedConnectorIds for ALL connectors touching the note", () => {
    const id = newBoardId();
    const a = createNote(id, { x: 0, y: 0, color: "#fff", createdBy: "U" });
    const b = createNote(id, { x: 100, y: 0, color: "#fff", createdBy: "U" });
    const c = createNote(id, { x: 200, y: 0, color: "#fff", createdBy: "U" });
    const ab = createConnector(id, {
      fromNoteId: a.id,
      toNoteId: b.id,
      fromSide: "right",
      toSide: "left",
      style: "arrow",
      color: "#000000",
    });
    const bc = createConnector(id, {
      fromNoteId: b.id,
      toNoteId: c.id,
      fromSide: "right",
      toSide: "left",
      style: "arrow",
      color: "#000000",
    });
    const ac = createConnector(id, {
      fromNoteId: a.id,
      toNoteId: c.id,
      fromSide: "bottom",
      toSide: "top",
      style: "arrow",
      color: "#000000",
    });
    expect(ab && bc && ac).toBeTruthy();

    const result = deleteNote(id, b.id);
    expect(result.deleted).toBe(true);
    expect([...result.removedConnectorIds].sort()).toEqual([ab!.id, bc!.id].sort());

    const snap = getBoardSnapshot(id);
    expect(snap.notes.find((n) => n.id === b.id)).toBeUndefined();
    expect(snap.connectors.map((c) => c.id)).toEqual([ac!.id]);
  });

  it("deleteNote on missing id is a no-op (no thrown error, no removed connectors)", () => {
    const id = newBoardId();
    const result = deleteNote(id, "does-not-exist");
    expect(result.deleted).toBe(false);
    expect(result.removedConnectorIds).toEqual([]);
  });

  it("LWW: second editNote overwrites first within same board (no CRDT/merge)", () => {
    const id = newBoardId();
    const n = createNote(id, { x: 0, y: 0, color: "#fff", createdBy: "U" });
    editNote(id, n.id, "first");
    editNote(id, n.id, "second");
    const snap = getBoardSnapshot(id);
    expect(snap.notes.find((x) => x.id === n.id)?.text).toBe("second");
  });

  it("LWW: formatNote also obeys last-write-wins", () => {
    const id = newBoardId();
    const n = createNote(id, { x: 0, y: 0, color: "#fff", createdBy: "U" });
    formatNote(id, n.id, { fontSize: 12, align: "left" });
    formatNote(id, n.id, { fontSize: 24, align: "right" });
    const snap = getBoardSnapshot(id);
    const stored = snap.notes.find((x) => x.id === n.id)!;
    expect(stored.fontSize).toBe(24);
    expect(stored.align).toBe("right");
  });

  it("replaceBoard FULLY replaces existing board (no merge with prior content)", () => {
    const id = newBoardId();
    createNote(id, { x: 0, y: 0, color: "#fef08a", createdBy: "U" });
    createNote(id, { x: 0, y: 0, color: "#fef08a", createdBy: "U" });

    replaceBoard(id, {
      notes: [
        {
          id: "x",
          text: "x",
          x: 0,
          y: 0,
          width: 200,
          height: 100,
          color: "#ffffff",
          createdBy: "T",
          createdAt: 1,
          updatedAt: 1,
          zIndex: 1,
          fontSize: 14,
          align: "left",
        },
      ],
      connectors: [],
      frames: [],
    });

    const snap = getBoardSnapshot(id);
    expect(snap.notes).toHaveLength(1);
    expect(snap.notes[0].id).toBe("x");
  });

  it("replaceBoard PRESERVES note ids exactly (round-trip invariant)", () => {
    const id = newBoardId();
    replaceBoard(id, {
      notes: [
        {
          id: "preserve-1",
          text: "",
          x: 0,
          y: 0,
          width: 200,
          height: 100,
          color: "#ffffff",
          createdBy: "T",
          createdAt: 1,
          updatedAt: 1,
          zIndex: 1,
          fontSize: 14,
          align: "left",
        },
        {
          id: "preserve-2",
          text: "",
          x: 100,
          y: 0,
          width: 200,
          height: 100,
          color: "#ffffff",
          createdBy: "T",
          createdAt: 1,
          updatedAt: 1,
          zIndex: 1,
          fontSize: 14,
          align: "left",
        },
      ],
      connectors: [],
      frames: [],
    });
    const ids = getBoardSnapshot(id)
      .notes.map((n) => n.id)
      .sort();
    expect(ids).toEqual(["preserve-1", "preserve-2"]);
  });

  it("createConnector returns null when from or to note doesn't exist", () => {
    const id = newBoardId();
    const a = createNote(id, { x: 0, y: 0, color: "#fff", createdBy: "U" });
    expect(
      createConnector(id, {
        fromNoteId: a.id,
        toNoteId: "missing-note",
        fromSide: "right",
        toSide: "left",
        style: "arrow",
        color: "#000000",
      }),
    ).toBeNull();
  });

  it("createConnector refuses self-loop", () => {
    const id = newBoardId();
    const a = createNote(id, { x: 0, y: 0, color: "#fff", createdBy: "U" });
    expect(
      createConnector(id, {
        fromNoteId: a.id,
        toNoteId: a.id,
        fromSide: "right",
        toSide: "left",
        style: "arrow",
        color: "#000000",
      }),
    ).toBeNull();
  });

  it("bringToFront produces strictly increasing zIndex for repeated calls", () => {
    const id = newBoardId();
    const a = createNote(id, { x: 0, y: 0, color: "#fff", createdBy: "U" });
    const b = createNote(id, { x: 0, y: 0, color: "#fff", createdBy: "U" });
    const z1 = bringToFront(id, a.id);
    const z2 = bringToFront(id, b.id);
    const z3 = bringToFront(id, a.id);
    expect(z1).not.toBeNull();
    expect(z2).not.toBeNull();
    expect(z3).not.toBeNull();
    expect(z2!).toBeGreaterThan(z1!);
    expect(z3!).toBeGreaterThan(z2!);
  });

  it("createFrame is independent of notes (frame survives note deletion)", () => {
    const id = newBoardId();
    const f = createFrame(id, {
      x: 0,
      y: 0,
      width: 800,
      height: 600,
      color: "#888888",
      title: "S",
    });
    const n = createNote(id, { x: 0, y: 0, color: "#fff", createdBy: "U" });
    deleteNote(id, n.id);
    const snap = getBoardSnapshot(id);
    expect(snap.frames.find((x) => x.id === f.id)).toBeDefined();
  });
});
