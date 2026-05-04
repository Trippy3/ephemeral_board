import yaml from "js-yaml";
import { describe, expect, it } from "vitest";
import { exportAsMarkdown } from "../../export.js";
import { SCHEMA_VERSION } from "../../shared.js";
import {
  createConnector,
  createFrame,
  createNote,
  editNote,
  formatNote,
  getOrCreateBoard,
} from "../../state.js";

function newBoardId(): string {
  return `test-export-${Math.random().toString(36).slice(2, 10)}`;
}

interface YamlBlock {
  kind: "note" | "connector" | "frame";
  data: Record<string, unknown>;
}

function extractBlocks(md: string): YamlBlock[] {
  const re = /```yaml\s+(note|connector|frame)\s*\n([\s\S]*?)\n```/g;
  const out: YamlBlock[] = [];
  for (const m of md.matchAll(re)) {
    out.push({
      kind: m[1] as YamlBlock["kind"],
      data: yaml.load(m[2]) as Record<string, unknown>,
    });
  }
  return out;
}

describe("exportAsMarkdown", () => {
  it("emits frontmatter with schemaVersion, board id, counts", () => {
    const id = newBoardId();
    getOrCreateBoard(id); // seeds guide notes
    const md = exportAsMarkdown(id);
    expect(md).toContain(`schemaVersion: ${SCHEMA_VERSION}`);
    expect(md).toContain(`board: ${id}`);
    expect(md).toMatch(/notes:\s+\d+/);
  });

  it("emits a yaml note block per note with id and core fields", () => {
    const id = newBoardId();
    const n = createNote(id, { x: 12.4, y: 34.6, color: "#fef08a", createdBy: "Alice" });
    editNote(id, n.id, "<b>hello</b>");
    formatNote(id, n.id, { fontSize: 18, align: "center" });

    const blocks = extractBlocks(exportAsMarkdown(id));
    const target = blocks.find((b) => b.kind === "note" && b.data.id === n.id);
    expect(target).toBeDefined();
    expect(target?.data).toMatchObject({
      id: n.id,
      type: "note",
      x: 12, // rounded
      y: 35, // rounded
      color: "#fef08a",
      fontSize: 18,
      align: "center",
      text: "<b>hello</b>",
      createdBy: "Alice",
    });
  });

  it("emits a yaml connector block with sides", () => {
    const id = newBoardId();
    const a = createNote(id, { x: 0, y: 0, color: "#fff", createdBy: "U" });
    const b = createNote(id, { x: 500, y: 0, color: "#fff", createdBy: "U" });
    const c = createConnector(id, {
      fromNoteId: a.id,
      toNoteId: b.id,
      fromSide: "right",
      toSide: "left",
      style: "arrow",
      color: "#000000",
    });
    expect(c).not.toBeNull();
    const blocks = extractBlocks(exportAsMarkdown(id));
    const target = blocks.find((b) => b.kind === "connector" && b.data.id === c?.id);
    expect(target?.data).toMatchObject({
      id: c?.id,
      from: a.id,
      to: b.id,
      fromSide: "right",
      toSide: "left",
      style: "arrow",
    });
  });

  it("emits a yaml frame block with title", () => {
    const id = newBoardId();
    const f = createFrame(id, { x: 0, y: 0, width: 800, height: 600, color: "#888", title: "S" });
    const blocks = extractBlocks(exportAsMarkdown(id));
    const target = blocks.find((b) => b.kind === "frame" && b.data.id === f.id);
    expect(target?.data).toMatchObject({ id: f.id, type: "frame", title: "S" });
  });

  it("renders the empty-board sentinel when nothing exists", () => {
    // Force a fresh board with no content. getOrCreateBoard adds guide notes,
    // so we instead use a raw Map-like flow: just inspect a never-touched id
    // via exportAsMarkdown — it goes through getBoardSnapshot which returns
    // empty arrays for unknown boards.
    const id = `never-touched-${Math.random()}`;
    const md = exportAsMarkdown(id);
    expect(md).toMatch(/_No content on this board\._/);
  });
});
