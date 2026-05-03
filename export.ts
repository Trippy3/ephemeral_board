import yaml from "js-yaml";
import { type Connector, type Frame, SCHEMA_VERSION, type StickyNote } from "./shared.js";
import { getBoardSnapshot } from "./state.js";

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
  return `\`\`\`yaml note\n${yaml.dump(data, { lineWidth: 120 })}\`\`\``;
}

function connectorToYamlBlock(c: Connector): string {
  const data = {
    id: c.id,
    type: "connector",
    from: c.fromNoteId,
    to: c.toNoteId,
    fromSide: c.fromSide,
    toSide: c.toSide,
    shape: c.shape,
    style: c.style,
    color: c.color,
    createdAt: new Date(c.createdAt).toISOString(),
    updatedAt: new Date(c.updatedAt).toISOString(),
  };
  return `\`\`\`yaml connector\n${yaml.dump(data, { lineWidth: 120 })}\`\`\``;
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
  return `\`\`\`yaml frame\n${yaml.dump(data, { lineWidth: 120 })}\`\`\``;
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
    return `${front}\n_No content on this board._\n`;
  }

  let meta = "## Data\n\n_Do not hand-edit blocks below if you intend to re-import._\n\n";
  for (const n of notes) meta += `${noteToYamlBlock(n)}\n\n`;
  for (const c of connectors) meta += `${connectorToYamlBlock(c)}\n\n`;
  for (const f of frames) meta += `${frameToYamlBlock(f)}\n\n`;

  return front + meta;
}
