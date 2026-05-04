import request from "supertest";
import { describe, expect, it } from "vitest";
import { exportAsMarkdown } from "../../export.js";
import { app } from "../../server.js";
import { createNote, getBoardSnapshot, getOrCreateBoard } from "../../state.js";

function newBoardId(): string {
  return `it-http-${Math.random().toString(36).slice(2, 10)}`;
}

describe("HTTP API", () => {
  it("GET /api/boards/:id/export.md returns text/markdown with frontmatter", async () => {
    const id = newBoardId();
    getOrCreateBoard(id);
    const res = await request(app).get(`/api/boards/${id}/export.md`);
    expect(res.status).toBe(200);
    expect(res.headers["content-type"]).toMatch(/text\/markdown/);
    expect(res.text).toContain(`board: ${id}`);
    expect(res.text).toContain("schemaVersion:");
  });

  it("POST /api/boards/:id/import accepts a roundtripped payload and replaces target board", async () => {
    const src = newBoardId();
    const n = createNote(src, { x: 5, y: 5, color: "#fef08a", createdBy: "U" });
    const md = exportAsMarkdown(src);

    const dst = newBoardId();
    const res = await request(app)
      .post(`/api/boards/${dst}/import`)
      .set("Content-Type", "text/plain")
      .send(md);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.notes).toBeGreaterThan(0);

    const snap = getBoardSnapshot(dst);
    expect(snap.notes.find((x) => x.id === n.id)).toBeDefined();
  });

  it("POST /api/boards/:id/import rejects empty body with 400", async () => {
    const dst = newBoardId();
    const res = await request(app)
      .post(`/api/boards/${dst}/import`)
      .set("Content-Type", "text/plain")
      .send("");
    expect(res.status).toBe(400);
  });

  it("POST /api/boards/:id/import rejects malformed YAML with 400", async () => {
    const dst = newBoardId();
    const bad = ["```yaml note", "id: x", "type: note", "x: not-a-number", "```"].join("\n");
    const res = await request(app)
      .post(`/api/boards/${dst}/import`)
      .set("Content-Type", "text/plain")
      .send(bad);
    expect(res.status).toBe(400);
    expect(res.body.error).toBeDefined();
  });

  it("POST /api/boards/:id/import does NOT damage existing board on rejected input", async () => {
    const dst = newBoardId();
    const n = createNote(dst, { x: 1, y: 1, color: "#fef08a", createdBy: "U" });
    await request(app).post(`/api/boards/${dst}/import`).set("Content-Type", "text/plain").send(""); // 400
    const snap = getBoardSnapshot(dst);
    expect(snap.notes.find((x) => x.id === n.id)).toBeDefined();
  });
});
