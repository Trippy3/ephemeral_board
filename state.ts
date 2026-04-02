import { nanoid } from "nanoid";
import { StickyNote } from "./shared.js";

export type { StickyNote };

export interface BoardState {
  id: string;
  notes: Map<string, StickyNote>;
  createdAt: number;
  lastActivityAt: number;
}

const boards = new Map<string, BoardState>();
const CLEANUP_INTERVAL = 10 * 60 * 1000; // 10 minutes
const BOARD_TTL = 24 * 60 * 60 * 1000; // 24 hours

const USER_COLORS = [
  "#ef4444", "#f97316", "#eab308", "#22c55e",
  "#06b6d4", "#3b82f6", "#8b5cf6", "#ec4899",
];
let colorIndex = 0;

export function assignUserColor(): string {
  const color = USER_COLORS[colorIndex % USER_COLORS.length];
  colorIndex++;
  return color;
}

const GUIDE_NOTES: { text: string; color: string }[] = [
  {
    color: "#93c5fd",
    text: "📌 付箋の基本操作\n\nダブルクリック → 付箋を作成\nドラッグ → 移動\nクリック → テキスト編集\n右下角ドラッグ → リサイズ",
  },
  {
    color: "#86efac",
    text: "🎨 色と削除\n\nツールバーで色を選んでから作成\n🎨 ボタン → 色を変更\n✕ ボタン → 削除",
  },
  {
    color: "#fef08a",
    text: "🔍 ボード操作\n\nマウスホイール → ズーム\n空白をドラッグ → パン（スクロール）\nExport MD → Markdownで保存",
  },
  {
    color: "#c4b5fd",
    text: "👥 共同編集\n\n同じURLを共有するだけ！\n他のユーザーのカーソルが見えます\n\nこのガイド付箋は不要なら削除してOK",
  },
];

export function getOrCreateBoard(boardId: string): BoardState {
  let board = boards.get(boardId);
  if (!board) {
    const now = Date.now();
    board = {
      id: boardId,
      notes: new Map(),
      createdAt: now,
      lastActivityAt: now,
    };
    for (let i = 0; i < GUIDE_NOTES.length; i++) {
      const guide = GUIDE_NOTES[i];
      maxZIndex++;
      const note: StickyNote = {
        id: nanoid(10),
        text: guide.text,
        x: 80 + i * 250,
        y: 80,
        width: 230,
        height: 230,
        color: guide.color,
        createdBy: "System",
        createdAt: now,
        updatedAt: now,
        zIndex: maxZIndex,
      };
      board.notes.set(note.id, note);
    }
    boards.set(boardId, board);
  }
  return board;
}

export function getBoardSnapshot(boardId: string): StickyNote[] {
  const board = boards.get(boardId);
  if (!board) return [];
  return Array.from(board.notes.values());
}

let maxZIndex = 0;

export function createNote(
  boardId: string,
  data: { x: number; y: number; color: string; createdBy: string }
): StickyNote {
  const board = getOrCreateBoard(boardId);
  const now = Date.now();
  maxZIndex++;
  const note: StickyNote = {
    id: nanoid(10),
    text: "",
    x: data.x,
    y: data.y,
    width: 200,
    height: 160,
    color: data.color,
    createdBy: data.createdBy,
    createdAt: now,
    updatedAt: now,
    zIndex: maxZIndex,
  };
  board.notes.set(note.id, note);
  board.lastActivityAt = now;
  return note;
}

export function moveNote(
  boardId: string,
  noteId: string,
  x: number,
  y: number
): StickyNote | null {
  const board = boards.get(boardId);
  if (!board) return null;
  const note = board.notes.get(noteId);
  if (!note) return null;
  const now = Date.now();
  note.x = x;
  note.y = y;
  note.updatedAt = now;
  board.lastActivityAt = now;
  return note;
}

export function editNote(
  boardId: string,
  noteId: string,
  text: string
): StickyNote | null {
  const board = boards.get(boardId);
  if (!board) return null;
  const note = board.notes.get(noteId);
  if (!note) return null;
  const now = Date.now();
  note.text = text;
  note.updatedAt = now;
  board.lastActivityAt = now;
  return note;
}

export function deleteNote(boardId: string, noteId: string): boolean {
  const board = boards.get(boardId);
  if (!board) return false;
  const deleted = board.notes.delete(noteId);
  if (deleted) board.lastActivityAt = Date.now();
  return deleted;
}

export function changeNoteColor(
  boardId: string,
  noteId: string,
  color: string
): StickyNote | null {
  const board = boards.get(boardId);
  if (!board) return null;
  const note = board.notes.get(noteId);
  if (!note) return null;
  const now = Date.now();
  note.color = color;
  note.updatedAt = now;
  board.lastActivityAt = now;
  return note;
}

export function bringToFront(
  boardId: string,
  noteId: string
): number | null {
  const board = boards.get(boardId);
  if (!board) return null;
  const note = board.notes.get(noteId);
  if (!note) return null;
  maxZIndex++;
  note.zIndex = maxZIndex;
  return maxZIndex;
}

export function resizeNote(
  boardId: string,
  noteId: string,
  width: number,
  height: number
): StickyNote | null {
  const board = boards.get(boardId);
  if (!board) return null;
  const note = board.notes.get(noteId);
  if (!note) return null;
  const now = Date.now();
  note.width = width;
  note.height = height;
  note.updatedAt = now;
  board.lastActivityAt = now;
  return note;
}

export function startCleanup(): void {
  setInterval(() => {
    const now = Date.now();
    for (const [id, board] of boards) {
      if (now - board.lastActivityAt > BOARD_TTL) {
        boards.delete(id);
        console.log(`Board ${id} cleaned up (inactive for 24h)`);
      }
    }
  }, CLEANUP_INTERVAL);
}
