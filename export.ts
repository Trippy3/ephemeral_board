import { getBoardSnapshot, type StickyNote } from "./state.js";
import { NOTE_COLORS } from "./shared.js";

const colorLabelMap = new Map(NOTE_COLORS.map((c) => [c.hex, c.label]));

function getColorLabel(hex: string): string {
  return colorLabelMap.get(hex) || hex;
}

function spatialSort(a: StickyNote, b: StickyNote): number {
  const rowSize = 200;
  const rowA = Math.floor(a.y / rowSize);
  const rowB = Math.floor(b.y / rowSize);
  if (rowA !== rowB) return rowA - rowB;
  return a.x - b.x;
}

export function exportAsMarkdown(boardId: string): string {
  const notes = getBoardSnapshot(boardId);
  if (notes.length === 0) {
    return `---\nboard: ${boardId}\nexported: ${new Date().toISOString()}\nnotes: 0\n---\n\n_No notes on this board._\n`;
  }

  const grouped = new Map<string, StickyNote[]>();
  for (const note of notes) {
    const key = note.color;
    if (!grouped.has(key)) grouped.set(key, []);
    grouped.get(key)!.push(note);
  }

  let md = `---\nboard: ${boardId}\nexported: ${new Date().toISOString()}\nnotes: ${notes.length}\n---\n\n`;

  for (const [color, colorNotes] of grouped) {
    colorNotes.sort(spatialSort);
    md += `## ${getColorLabel(color)}\n\n`;
    for (const note of colorNotes) {
      const text = note.text.trim() || "(empty)";
      const lines = text.split("\n");
      md += `- ${lines[0]}`;
      for (let i = 1; i < lines.length; i++) {
        md += `\n  ${lines[i]}`;
      }
      md += "\n";
    }
    md += "\n";
  }

  return md;
}
