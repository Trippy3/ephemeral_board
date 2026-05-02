import yaml from "js-yaml";
import { getBoardSnapshot } from "./state.js";
import { NOTE_COLORS, SCHEMA_VERSION, type StickyNote, type Connector, type Frame } from "./shared.js";

const colorLabelMap = new Map(NOTE_COLORS.map((c) => [c.hex.toLowerCase(), c.label]));

function getColorLabel(hex: string): string {
  return colorLabelMap.get(hex.toLowerCase()) || hex;
}

function spatialSort(a: StickyNote, b: StickyNote): number {
  const rowSize = 200;
  const rowA = Math.floor(a.y / rowSize);
  const rowB = Math.floor(b.y / rowSize);
  if (rowA !== rowB) return rowA - rowB;
  return a.x - b.x;
}

function htmlToPlainSummary(html: string): string {
  // Strip HTML tags and decode entities for the human-readable summary section.
  // Bold and alignment are preserved as plain text — full fidelity lives in the
  // YAML metadata blocks below.
  const stripped = html
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(div|p)>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
  return stripped.trim();
}

function noteToYamlBlock(note: StickyNote): string {
  const data = {
    id: note.id,
    type: "note",
    x: Math.round(note.x),
    y: Math.round(note.y),
    width: Math.round(note.width),
    height: Math.round(note.height),
    color: note.color,
    fontSize: note.fontSize,
    align: note.align,
    createdBy: note.createdBy,
    createdAt: new Date(note.createdAt).toISOString(),
    updatedAt: new Date(note.updatedAt).toISOString(),
    zIndex: note.zIndex,
    text: note.text,
  };
  return "```yaml note\n" + yaml.dump(data, { lineWidth: 120 }) + "```";
}

function connectorToYamlBlock(c: Connector): string {
  const data = {
    id: c.id,
    type: "connector",
    from: c.fromNoteId,
    to: c.toNoteId,
    style: c.style,
    color: c.color,
    createdAt: new Date(c.createdAt).toISOString(),
    updatedAt: new Date(c.updatedAt).toISOString(),
  };
  return "```yaml connector\n" + yaml.dump(data, { lineWidth: 120 }) + "```";
}

function frameToYamlBlock(f: Frame): string {
  const data = {
    id: f.id,
    type: "frame",
    x: Math.round(f.x),
    y: Math.round(f.y),
    width: Math.round(f.width),
    height: Math.round(f.height),
    color: f.color,
    title: f.title,
    createdAt: new Date(f.createdAt).toISOString(),
    updatedAt: new Date(f.updatedAt).toISOString(),
  };
  return "```yaml frame\n" + yaml.dump(data, { lineWidth: 120 }) + "```";
}

export function exportAsMarkdown(boardId: string): string {
  const { notes, connectors, frames } = getBoardSnapshot(boardId);

  const front = [
    "---",
    `schemaVersion: ${SCHEMA_VERSION}`,
    `board: ${boardId}`,
    `exported: ${new Date().toISOString()}`,
    `notes: ${notes.length}`,
    `connectors: ${connectors.length}`,
    `frames: ${frames.length}`,
    "---",
    "",
  ].join("\n");

  if (notes.length === 0 && connectors.length === 0 && frames.length === 0) {
    return front + "\n_No content on this board._\n";
  }

  // Human-readable summary: notes grouped by color
  let summary = "## Summary\n\n";
  if (notes.length > 0) {
    const grouped = new Map<string, StickyNote[]>();
    for (const note of notes) {
      const key = note.color;
      if (!grouped.has(key)) grouped.set(key, []);
      grouped.get(key)!.push(note);
    }
    for (const [color, colorNotes] of grouped) {
      colorNotes.sort(spatialSort);
      summary += `### ${getColorLabel(color)}\n\n`;
      for (const note of colorNotes) {
        const text = htmlToPlainSummary(note.text) || "(empty)";
        const lines = text.split("\n");
        summary += `- ${lines[0]}`;
        for (let i = 1; i < lines.length; i++) summary += `\n  ${lines[i]}`;
        summary += "\n";
      }
      summary += "\n";
    }
  }
  if (connectors.length > 0) {
    summary += "### Connections\n\n";
    const noteTextById = new Map(notes.map((n) => [n.id, htmlToPlainSummary(n.text).split("\n")[0] || "(empty)"]));
    for (const c of connectors) {
      const from = noteTextById.get(c.fromNoteId) || c.fromNoteId;
      const to = noteTextById.get(c.toNoteId) || c.toNoteId;
      const sep = c.style === "arrow" ? "→" : "—";
      summary += `- ${from} ${sep} ${to}\n`;
    }
    summary += "\n";
  }
  if (frames.length > 0) {
    summary += "### Frames\n\n";
    for (const f of frames) {
      summary += `- ${f.title || "(untitled frame)"}\n`;
    }
    summary += "\n";
  }

  // Machine-readable metadata blocks (full state for round-trip)
  let meta = "## Data\n\n_Do not hand-edit blocks below if you intend to re-import._\n\n";
  for (const n of notes) meta += noteToYamlBlock(n) + "\n\n";
  for (const c of connectors) meta += connectorToYamlBlock(c) + "\n\n";
  for (const f of frames) meta += frameToYamlBlock(f) + "\n\n";

  return front + summary + meta;
}
