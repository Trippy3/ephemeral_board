import { describe, expect, it } from "vitest";
import { parseMarkdownImport } from "../../import.js";

function noteBlock(yaml: string): string {
  return ["```yaml note", yaml, "```"].join("\n");
}
function connectorBlock(yaml: string): string {
  return ["```yaml connector", yaml, "```"].join("\n");
}
function frameBlock(yaml: string): string {
  return ["```yaml frame", yaml, "```"].join("\n");
}

describe("parseMarkdownImport", () => {
  it("parses a minimal note block and preserves id", () => {
    const md = noteBlock(
      [
        "id: note-1",
        "type: note",
        "x: 10",
        "y: 20",
        "width: 200",
        "height: 100",
        'color: "#fef08a"',
        'text: "hello"',
      ].join("\n"),
    );
    const result = parseMarkdownImport(md);
    expect(result.notes).toHaveLength(1);
    expect(result.notes[0].id).toBe("note-1");
    expect(result.notes[0].x).toBe(10);
    expect(result.notes[0].text).toBe("hello");
    expect(result.notes[0].fontSize).toBe(14); // default
    expect(result.notes[0].align).toBe("left"); // default
  });

  it("rejects an empty id", () => {
    const md = noteBlock(
      ['id: ""', "type: note", "x: 0", "y: 0", "width: 200", "height: 100", 'color: "#fff"'].join(
        "\n",
      ),
    );
    expect(() => parseMarkdownImport(md)).toThrow();
  });

  it("rejects a malformed color", () => {
    const md = noteBlock(
      ["id: x", "type: note", "x: 0", "y: 0", "width: 200", "height: 100", "color: red"].join("\n"),
    );
    expect(() => parseMarkdownImport(md)).toThrow();
  });

  it("rejects negative width / height", () => {
    const md = noteBlock(
      ["id: x", "type: note", "x: 0", "y: 0", "width: -1", "height: 100", 'color: "#fff"'].join(
        "\n",
      ),
    );
    expect(() => parseMarkdownImport(md)).toThrow();
  });

  it("clamps oversized text via server sanitizer (no <script> after import)", () => {
    const md = noteBlock(
      [
        "id: x",
        "type: note",
        "x: 0",
        "y: 0",
        "width: 200",
        "height: 100",
        'color: "#fff"',
        'text: "<script>alert(1)</script>safe"',
      ].join("\n"),
    );
    const r = parseMarkdownImport(md);
    expect(r.notes[0].text).not.toMatch(/script/i);
    expect(r.notes[0].text).toContain("safe");
  });

  it("accepts both fromSide/toSide and snake-case from_side/to_side", () => {
    const md = [
      noteBlock(
        ["id: a", "type: note", "x: 0", "y: 0", "width: 200", "height: 100", 'color: "#fff"'].join(
          "\n",
        ),
      ),
      noteBlock(
        [
          "id: b",
          "type: note",
          "x: 500",
          "y: 0",
          "width: 200",
          "height: 100",
          'color: "#fff"',
        ].join("\n"),
      ),
      connectorBlock(
        [
          "id: c1",
          "type: connector",
          "from: a",
          "to: b",
          "from_side: right",
          "to_side: left",
          "style: arrow",
          'color: "#000"',
        ].join("\n"),
      ),
    ].join("\n\n");
    const r = parseMarkdownImport(md);
    expect(r.connectors).toHaveLength(1);
    expect(r.connectors[0].fromSide).toBe("right");
    expect(r.connectors[0].toSide).toBe("left");
  });

  it("orphan-prunes connectors that reference unknown notes", () => {
    const md = [
      noteBlock(
        ["id: a", "type: note", "x: 0", "y: 0", "width: 200", "height: 100", 'color: "#fff"'].join(
          "\n",
        ),
      ),
      connectorBlock(
        [
          "id: c1",
          "type: connector",
          "from: a",
          "to: missing",
          "fromSide: right",
          "toSide: left",
          "style: arrow",
          'color: "#000"',
        ].join("\n"),
      ),
    ].join("\n\n");
    const r = parseMarkdownImport(md);
    expect(r.connectors).toHaveLength(0);
  });

  it("fills in missing sides for legacy connectors via closestSidesBetween", () => {
    const md = [
      noteBlock(
        ["id: a", "type: note", "x: 0", "y: 0", "width: 100", "height: 100", 'color: "#fff"'].join(
          "\n",
        ),
      ),
      noteBlock(
        [
          "id: b",
          "type: note",
          "x: 500",
          "y: 0",
          "width: 100",
          "height: 100",
          'color: "#fff"',
        ].join("\n"),
      ),
      connectorBlock(
        ["id: c1", "type: connector", "from: a", "to: b", "style: line", 'color: "#000"'].join(
          "\n",
        ),
      ),
    ].join("\n\n");
    const r = parseMarkdownImport(md);
    expect(r.connectors[0].fromSide).toBe("right");
    expect(r.connectors[0].toSide).toBe("left");
  });

  it("parses a frame", () => {
    const md = frameBlock(
      [
        "id: f1",
        "type: frame",
        "x: 0",
        "y: 0",
        "width: 800",
        "height: 600",
        'color: "#888"',
        'title: "Section A"',
      ].join("\n"),
    );
    const r = parseMarkdownImport(md);
    expect(r.frames).toHaveLength(1);
    expect(r.frames[0].title).toBe("Section A");
  });

  it("throws on input larger than 1 MB cap", () => {
    const big = "x".repeat(1_000_001);
    expect(() => parseMarkdownImport(big)).toThrow(/too large|limit/i);
  });

  it("throws on > 1000 elements", () => {
    const blocks: string[] = [];
    for (let i = 0; i < 1001; i++) {
      blocks.push(
        noteBlock(
          [
            `id: n${i}`,
            "type: note",
            "x: 0",
            "y: 0",
            "width: 200",
            "height: 100",
            'color: "#fff"',
          ].join("\n"),
        ),
      );
    }
    expect(() => parseMarkdownImport(blocks.join("\n\n"))).toThrow(/limit|too many/i);
  });

  it("isoToMs accepts ISO string, numeric ms, and Date-like (numeric path)", () => {
    const md = noteBlock(
      [
        "id: a",
        "type: note",
        "x: 0",
        "y: 0",
        "width: 200",
        "height: 100",
        'color: "#fff"',
        'createdAt: "2024-01-02T03:04:05Z"',
        "updatedAt: 1735689600000",
      ].join("\n"),
    );
    const r = parseMarkdownImport(md);
    expect(r.notes[0].createdAt).toBe(Date.parse("2024-01-02T03:04:05Z"));
    expect(r.notes[0].updatedAt).toBe(1735689600000);
  });
});
