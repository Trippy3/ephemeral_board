import { nanoid } from "nanoid";
import {
  StickyNote,
  Connector,
  Frame,
  BoardSnapshot,
  SCHEMA_VERSION,
  DEFAULT_FONT_SIZE,
  DEFAULT_ALIGN,
  TextAlign,
  ConnectorStyle,
} from "./shared.js";

export type { StickyNote, Connector, Frame };

export interface BoardState {
  id: string;
  notes: Map<string, StickyNote>;
  connectors: Map<string, Connector>;
  frames: Map<string, Frame>;
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
    text: "🎨 色と書式\n\nツールバーで色を選んでから作成\n🎨 ボタン → 色を変更\nB / 整列 / サイズで書式変更",
  },
  {
    color: "#fef08a",
    text: "🔍 ボード操作\n\nマウスホイール → ズーム\n空白をドラッグ → パン\n空白で矩形ドラッグ → 複数選択\nDelete → 削除 / Ctrl+Z → 取り消し",
  },
  {
    color: "#c4b5fd",
    text: "👥 共同編集 & MD\n\n同じURLを共有するだけ\nExport MD → 状態を保存\nImport MD → 状態を復元\n\nこのガイド付箋は不要なら削除してOK",
  },
];

let maxZIndex = 0;

export function getOrCreateBoard(boardId: string): BoardState {
  let board = boards.get(boardId);
  if (!board) {
    const now = Date.now();
    board = {
      id: boardId,
      notes: new Map(),
      connectors: new Map(),
      frames: new Map(),
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
        fontSize: DEFAULT_FONT_SIZE,
        align: DEFAULT_ALIGN,
      };
      board.notes.set(note.id, note);
    }
    boards.set(boardId, board);
  }
  return board;
}

export function getBoardSnapshot(boardId: string): BoardSnapshot {
  const board = boards.get(boardId);
  if (!board) {
    return {
      schemaVersion: SCHEMA_VERSION,
      notes: [],
      connectors: [],
      frames: [],
    };
  }
  return {
    schemaVersion: SCHEMA_VERSION,
    notes: Array.from(board.notes.values()),
    connectors: Array.from(board.connectors.values()),
    frames: Array.from(board.frames.values()),
  };
}

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
    fontSize: DEFAULT_FONT_SIZE,
    align: DEFAULT_ALIGN,
  };
  board.notes.set(note.id, note);
  board.lastActivityAt = now;
  return note;
}

export function duplicateNote(
  boardId: string,
  source: { text: string; color: string; width: number; height: number; fontSize: number; align: TextAlign },
  data: { x: number; y: number; createdBy: string }
): StickyNote {
  const board = getOrCreateBoard(boardId);
  const now = Date.now();
  maxZIndex++;
  const note: StickyNote = {
    id: nanoid(10),
    text: source.text,
    x: data.x,
    y: data.y,
    width: source.width,
    height: source.height,
    color: source.color,
    createdBy: data.createdBy,
    createdAt: now,
    updatedAt: now,
    zIndex: maxZIndex,
    fontSize: source.fontSize,
    align: source.align,
  };
  board.notes.set(note.id, note);
  board.lastActivityAt = now;
  return note;
}

export function restoreNote(
  boardId: string,
  note: StickyNote
): StickyNote | null {
  const board = getOrCreateBoard(boardId);
  if (board.notes.has(note.id)) return null;
  const now = Date.now();
  maxZIndex = Math.max(maxZIndex, note.zIndex) + 1;
  const restored: StickyNote = { ...note, zIndex: maxZIndex, updatedAt: now };
  board.notes.set(restored.id, restored);
  board.lastActivityAt = now;
  return restored;
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

export function formatNote(
  boardId: string,
  noteId: string,
  data: { fontSize?: number; align?: TextAlign }
): StickyNote | null {
  const board = boards.get(boardId);
  if (!board) return null;
  const note = board.notes.get(noteId);
  if (!note) return null;
  const now = Date.now();
  if (data.fontSize !== undefined) note.fontSize = data.fontSize;
  if (data.align !== undefined) note.align = data.align;
  note.updatedAt = now;
  board.lastActivityAt = now;
  return note;
}

export function deleteNote(boardId: string, noteId: string): {
  deleted: boolean;
  removedConnectorIds: string[];
} {
  const board = boards.get(boardId);
  if (!board) return { deleted: false, removedConnectorIds: [] };
  const deleted = board.notes.delete(noteId);
  const removedConnectorIds: string[] = [];
  if (deleted) {
    for (const [cid, c] of board.connectors) {
      if (c.fromNoteId === noteId || c.toNoteId === noteId) {
        board.connectors.delete(cid);
        removedConnectorIds.push(cid);
      }
    }
    board.lastActivityAt = Date.now();
  }
  return { deleted, removedConnectorIds };
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

// --- Connector CRUD ---

export function createConnector(
  boardId: string,
  data: { fromNoteId: string; toNoteId: string; style: ConnectorStyle; color: string }
): Connector | null {
  const board = getOrCreateBoard(boardId);
  if (!board.notes.has(data.fromNoteId) || !board.notes.has(data.toNoteId)) {
    return null;
  }
  if (data.fromNoteId === data.toNoteId) return null;
  const now = Date.now();
  const connector: Connector = {
    id: nanoid(10),
    fromNoteId: data.fromNoteId,
    toNoteId: data.toNoteId,
    style: data.style,
    color: data.color,
    createdAt: now,
    updatedAt: now,
  };
  board.connectors.set(connector.id, connector);
  board.lastActivityAt = now;
  return connector;
}

export function deleteConnector(boardId: string, connectorId: string): boolean {
  const board = boards.get(boardId);
  if (!board) return false;
  const deleted = board.connectors.delete(connectorId);
  if (deleted) board.lastActivityAt = Date.now();
  return deleted;
}

// --- Frame CRUD ---

export function createFrame(
  boardId: string,
  data: { x: number; y: number; width: number; height: number; color: string; title: string }
): Frame {
  const board = getOrCreateBoard(boardId);
  const now = Date.now();
  const frame: Frame = {
    id: nanoid(10),
    x: data.x,
    y: data.y,
    width: data.width,
    height: data.height,
    color: data.color,
    title: data.title,
    createdAt: now,
    updatedAt: now,
  };
  board.frames.set(frame.id, frame);
  board.lastActivityAt = now;
  return frame;
}

export function updateFrame(
  boardId: string,
  frameId: string,
  data: Partial<Pick<Frame, "x" | "y" | "width" | "height" | "color" | "title">>
): Frame | null {
  const board = boards.get(boardId);
  if (!board) return null;
  const frame = board.frames.get(frameId);
  if (!frame) return null;
  const now = Date.now();
  if (data.x !== undefined) frame.x = data.x;
  if (data.y !== undefined) frame.y = data.y;
  if (data.width !== undefined) frame.width = data.width;
  if (data.height !== undefined) frame.height = data.height;
  if (data.color !== undefined) frame.color = data.color;
  if (data.title !== undefined) frame.title = data.title;
  frame.updatedAt = now;
  board.lastActivityAt = now;
  return frame;
}

export function deleteFrame(boardId: string, frameId: string): boolean {
  const board = boards.get(boardId);
  if (!board) return false;
  const deleted = board.frames.delete(frameId);
  if (deleted) board.lastActivityAt = Date.now();
  return deleted;
}

// --- Replace whole board (for MD import) ---

export function replaceBoard(
  boardId: string,
  snapshot: { notes: StickyNote[]; connectors: Connector[]; frames: Frame[] }
): BoardState {
  const now = Date.now();
  const board: BoardState = {
    id: boardId,
    notes: new Map(snapshot.notes.map((n) => [n.id, n])),
    connectors: new Map(snapshot.connectors.map((c) => [c.id, c])),
    frames: new Map(snapshot.frames.map((f) => [f.id, f])),
    createdAt: now,
    lastActivityAt: now,
  };
  for (const note of snapshot.notes) {
    if (note.zIndex > maxZIndex) maxZIndex = note.zIndex;
  }
  boards.set(boardId, board);
  return board;
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
