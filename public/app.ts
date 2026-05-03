import { io, type Socket } from "socket.io-client";
import {
  type AnchorSide,
  type Connector,
  type ConnectorShape,
  DEFAULT_ALIGN,
  DEFAULT_FONT_SIZE,
  FONT_SIZES,
  type Frame,
  NOTE_COLORS,
  type StickyNote,
  type TextAlign,
} from "../shared.js";
import {
  anchorPoint,
  attachNoteEdgeAnchors,
  type InteractionDeps,
  setupBoardInteractions,
} from "./interaction.js";
import { sanitizeNoteHtml } from "./sanitize.js";

function throttle<T extends (...args: any[]) => void>(fn: T, ms: number): T {
  let last = 0;
  return ((...args: any[]) => {
    const now = Date.now();
    if (now - last >= ms) {
      last = now;
      fn(...args);
    }
  }) as T;
}

// --- State ---
let socket: Socket;
const boardId = location.pathname.slice(1) || "default";
let selectedColor = "#fef08a";
let scale = 1;
let panX = 0;
let panY = 0;
const notes = new Map<string, StickyNote>();
const connectors = new Map<string, Connector>();
const frames = new Map<string, Frame>();
const cursors = new Map<string, HTMLElement>();
const selectedNoteIds = new Set<string>();
let frameMode = false;
let clipboardNotes: StickyNote[] = [];
type DeleteUndoEntry = { kind: "delete"; notes: StickyNote[] };
const undoStack: DeleteUndoEntry[] = [];
const UNDO_LIMIT = 20;

// --- DOM refs ---
const board = document.getElementById("board")!;
const boardContainer = document.getElementById("board-container")!;
const nameDialog = document.getElementById("name-dialog")!;
const nameInput = document.getElementById("name-input") as HTMLInputElement;
const nameSubmit = document.getElementById("name-submit")!;
const usersList = document.getElementById("users-list")!;
const exportBtn = document.getElementById("export-btn")!;
const importBtn = document.getElementById("import-btn")!;
const importFileInput = document.getElementById("import-file") as HTMLInputElement;
const importConfirmDialog = document.getElementById("import-confirm-dialog")!;
const importSummaryEl = document.getElementById("import-summary")!;
const importCancelBtn = document.getElementById("import-cancel")!;
const importConfirmBtn = document.getElementById("import-confirm")!;
const zoomInBtn = document.getElementById("zoom-in-btn")!;
const zoomOutBtn = document.getElementById("zoom-out-btn")!;
const zoomResetBtn = document.getElementById("zoom-reset-btn")!;
const frameModeBtn = document.getElementById("frame-mode-btn")!;
const connectorLayer = document.getElementById("connector-layer") as unknown as SVGSVGElement;
const frameLayer = document.getElementById("frame-layer")!;

// --- Color palette ---
document.querySelectorAll("#color-palette .color-btn").forEach((btn) => {
  const el = btn as HTMLElement;
  if (el.dataset.color === selectedColor) el.classList.add("active");
  el.addEventListener("click", () => {
    document.querySelector("#color-palette .color-btn.active")?.classList.remove("active");
    el.classList.add("active");
    selectedColor = el.dataset.color!;
  });
});

// --- Name dialog ---
function joinBoard(name: string) {
  nameDialog.classList.add("hidden");
  socket = io();
  socket.emit("board:join", { boardId, name });
  setupSocketListeners();
}

nameSubmit.addEventListener("click", () => {
  const name = nameInput.value.trim();
  if (name) joinBoard(name);
});

nameInput.addEventListener("keydown", (e) => {
  if (e.key === "Enter") {
    const name = nameInput.value.trim();
    if (name) joinBoard(name);
  }
});

// --- Board transform ---
function updateTransform() {
  board.style.transform = `translate(${panX}px, ${panY}px) scale(${scale})`;
  zoomResetBtn.textContent = `${Math.round(scale * 100)}%`;
}

// Zoom
boardContainer.addEventListener(
  "wheel",
  (e) => {
    e.preventDefault();
    const delta = e.deltaY > 0 ? -0.1 : 0.1;
    const newScale = Math.min(3, Math.max(0.2, scale + delta));
    // Zoom toward mouse position
    const rect = boardContainer.getBoundingClientRect();
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;
    panX = mx - (mx - panX) * (newScale / scale);
    panY = my - (my - panY) * (newScale / scale);
    scale = newScale;
    updateTransform();
  },
  { passive: false },
);

zoomInBtn.addEventListener("click", () => {
  scale = Math.min(3, scale + 0.2);
  updateTransform();
});

zoomOutBtn.addEventListener("click", () => {
  scale = Math.max(0.2, scale - 0.2);
  updateTransform();
});

zoomResetBtn.addEventListener("click", () => {
  scale = 1;
  panX = 0;
  panY = 0;
  updateTransform();
});

// --- Double-click to create note ---
boardContainer.addEventListener("dblclick", (e) => {
  if (e.target !== boardContainer && e.target !== board) return;
  const rect = boardContainer.getBoundingClientRect();
  const x = (e.clientX - rect.left - panX) / scale;
  const y = (e.clientY - rect.top - panY) / scale;
  socket.emit("note:create", { x, y, color: selectedColor });
});

// --- Render note ---
function isDarkColor(hex: string): boolean {
  const meta = NOTE_COLORS.find((c) => c.hex.toLowerCase() === hex.toLowerCase());
  return meta?.dark === true;
}

function applyNoteFormat(textEl: HTMLElement, fontSize: number, align: TextAlign): void {
  textEl.style.fontSize = `${fontSize}px`;
  textEl.style.textAlign = align;
}

function flushNoteEdit(noteId: string, textEl: HTMLElement): void {
  const noteData = notes.get(noteId);
  if (!noteData) return;
  const safe = sanitizeNoteHtml(textEl.innerHTML);
  noteData.text = safe;
  socket.emit("note:edit", { id: noteId, text: safe });
}

function setNoteAlign(noteId: string, noteEl: HTMLElement, align: TextAlign): void {
  const noteData = notes.get(noteId);
  if (!noteData) return;
  noteData.align = align;
  const textEl = noteEl.querySelector(".note-text") as HTMLElement | null;
  if (textEl) textEl.style.textAlign = align;
  socket.emit("note:format", { id: noteId, align });
}

function stepNoteFontSize(noteId: string, noteEl: HTMLElement, step: number): void {
  const noteData = notes.get(noteId);
  if (!noteData) return;
  const current = noteData.fontSize ?? DEFAULT_FONT_SIZE;
  const idx = FONT_SIZES.indexOf(current as (typeof FONT_SIZES)[number]);
  const baseIdx = idx === -1 ? FONT_SIZES.indexOf(DEFAULT_FONT_SIZE) : idx;
  const nextIdx = Math.min(FONT_SIZES.length - 1, Math.max(0, baseIdx + step));
  const nextSize = FONT_SIZES[nextIdx];
  if (nextSize === noteData.fontSize) return;
  noteData.fontSize = nextSize;
  const textEl = noteEl.querySelector(".note-text") as HTMLElement | null;
  if (textEl) textEl.style.fontSize = `${nextSize}px`;
  socket.emit("note:format", { id: noteId, fontSize: nextSize });
}

function applyColorToNoteEl(el: HTMLElement, color: string): void {
  el.style.backgroundColor = color;
  el.dataset.color = color;
  el.classList.toggle("dark", isDarkColor(color));
}

function renderNote(note: StickyNote): HTMLElement {
  const el = document.createElement("div");
  el.className = "sticky-note";
  el.id = `note-${note.id}`;
  el.style.left = `${note.x}px`;
  el.style.top = `${note.y}px`;
  el.style.width = `${note.width}px`;
  el.style.height = `${note.height}px`;
  applyColorToNoteEl(el, note.color);
  el.style.zIndex = String(note.zIndex);

  // Header
  const header = document.createElement("div");
  header.className = "note-header";

  const author = document.createElement("span");
  author.className = "note-author";
  author.textContent = note.createdBy;

  const actions = document.createElement("div");
  actions.className = "note-actions";

  const boldBtn = document.createElement("button");
  boldBtn.className = "note-action-btn";
  boldBtn.innerHTML = "<b>B</b>";
  boldBtn.title = "Bold (Ctrl+B)";
  boldBtn.addEventListener("pointerdown", (e) => e.preventDefault());
  boldBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    document.execCommand("bold");
    flushNoteEdit(note.id, text);
  });

  const alignLeftBtn = document.createElement("button");
  alignLeftBtn.className = "note-action-btn";
  alignLeftBtn.textContent = "⯇";
  alignLeftBtn.title = "Align left";
  alignLeftBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    setNoteAlign(note.id, el, "left");
  });

  const alignCenterBtn = document.createElement("button");
  alignCenterBtn.className = "note-action-btn";
  alignCenterBtn.textContent = "≡";
  alignCenterBtn.title = "Align center";
  alignCenterBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    setNoteAlign(note.id, el, "center");
  });

  const alignRightBtn = document.createElement("button");
  alignRightBtn.className = "note-action-btn";
  alignRightBtn.textContent = "⯈";
  alignRightBtn.title = "Align right";
  alignRightBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    setNoteAlign(note.id, el, "right");
  });

  const sizeDownBtn = document.createElement("button");
  sizeDownBtn.className = "note-action-btn";
  sizeDownBtn.textContent = "A−";
  sizeDownBtn.title = "Smaller text";
  sizeDownBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    stepNoteFontSize(note.id, el, -1);
  });

  const sizeUpBtn = document.createElement("button");
  sizeUpBtn.className = "note-action-btn";
  sizeUpBtn.textContent = "A+";
  sizeUpBtn.title = "Larger text";
  sizeUpBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    stepNoteFontSize(note.id, el, 1);
  });

  const colorBtn = document.createElement("button");
  colorBtn.className = "note-action-btn";
  colorBtn.textContent = "🎨";
  colorBtn.title = "Change color";
  colorBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    showColorPicker(note.id, el);
  });

  const deleteBtn = document.createElement("button");
  deleteBtn.className = "note-action-btn";
  deleteBtn.textContent = "✕";
  deleteBtn.title = "Delete (Ctrl+Z to undo)";
  deleteBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    const current = notes.get(note.id);
    if (current) pushUndo({ kind: "delete", notes: [{ ...current }] });
    socket.emit("note:delete", { id: note.id });
  });

  actions.append(
    boldBtn,
    alignLeftBtn,
    alignCenterBtn,
    alignRightBtn,
    sizeDownBtn,
    sizeUpBtn,
    colorBtn,
    deleteBtn,
  );
  header.append(author, actions);

  // Text (HTML-formatted, sanitized)
  const text = document.createElement("div");
  text.className = "note-text";
  text.contentEditable = "true";
  text.innerHTML = sanitizeNoteHtml(note.text || "");
  applyNoteFormat(text, note.fontSize ?? DEFAULT_FONT_SIZE, note.align ?? DEFAULT_ALIGN);

  let editTimeout: ReturnType<typeof setTimeout>;
  text.addEventListener("input", () => {
    clearTimeout(editTimeout);
    editTimeout = setTimeout(() => flushNoteEdit(note.id, text), 300);
  });

  text.addEventListener("pointerdown", (e) => e.stopPropagation());

  // Resize handle
  const resizeHandle = document.createElement("div");
  resizeHandle.className = "resize-handle";
  setupResize(resizeHandle, note.id, el);

  el.append(header, text, resizeHandle);

  // Edge anchors (Miro-style): drag from any side handle to draw a connector to another note.
  attachNoteEdgeAnchors(el, note.id, interactionDeps);

  // Drag from header or note background (not text)
  setupDrag(el, note.id, el);

  board.appendChild(el);
  return el;
}

// --- Drag (with multi-select support) ---
function setupDrag(handle: HTMLElement, noteId: string, noteEl: HTMLElement) {
  let dragging = false;
  let startX = 0;
  let startY = 0;
  let groupOrigPositions: Map<string, { x: number; y: number }> = new Map();

  handle.addEventListener("pointerdown", (e) => {
    if (e.button !== 0) return;
    const target = e.target as HTMLElement;
    if (
      target.classList.contains("note-text") ||
      target.classList.contains("note-action-btn") ||
      target.classList.contains("resize-handle") ||
      target.classList.contains("note-anchor") ||
      target.contentEditable === "true"
    )
      return;

    e.stopPropagation();

    // Selection management on pointerdown
    if (e.shiftKey) {
      toggleNoteSelection(noteId);
    } else if (!selectedNoteIds.has(noteId)) {
      selectNote(noteId, false);
    }

    dragging = true;
    startX = e.clientX;
    startY = e.clientY;
    groupOrigPositions = new Map();
    const idsToMove = selectedNoteIds.has(noteId) ? Array.from(selectedNoteIds) : [noteId];
    for (const id of idsToMove) {
      const n = notes.get(id);
      if (n) groupOrigPositions.set(id, { x: n.x, y: n.y });
    }
    noteEl.classList.add("dragging");
    handle.setPointerCapture(e.pointerId);

    socket.emit("note:front", { id: noteId });
  });

  handle.addEventListener("pointermove", (e) => {
    if (!dragging) return;
    const dx = (e.clientX - startX) / scale;
    const dy = (e.clientY - startY) / scale;
    for (const [id, orig] of groupOrigPositions) {
      const nx = orig.x + dx;
      const ny = orig.y + dy;
      const n = notes.get(id);
      if (n) {
        n.x = nx;
        n.y = ny;
      }
      const targetEl = document.getElementById(`note-${id}`);
      if (targetEl) {
        targetEl.style.left = `${nx}px`;
        targetEl.style.top = `${ny}px`;
      }
      refreshConnectorsForNote(id);
      socket.emit("note:move", { id, x: nx, y: ny });
    }
  });

  handle.addEventListener("pointerup", () => {
    if (!dragging) return;
    dragging = false;
    noteEl.classList.remove("dragging");
    // Final accurate emit
    for (const [id] of groupOrigPositions) {
      const n = notes.get(id);
      if (n) socket.emit("note:move", { id, x: n.x, y: n.y });
    }
  });
}

// --- Resize ---
function setupResize(handle: HTMLElement, noteId: string, noteEl: HTMLElement) {
  let resizing = false;
  let startX = 0;
  let startY = 0;
  let origW = 0;
  let origH = 0;

  handle.addEventListener("pointerdown", (e) => {
    e.stopPropagation();
    resizing = true;
    startX = e.clientX;
    startY = e.clientY;
    const note = notes.get(noteId);
    if (note) {
      origW = note.width;
      origH = note.height;
    }
    handle.setPointerCapture(e.pointerId);
  });

  handle.addEventListener("pointermove", (e) => {
    if (!resizing) return;
    const dw = (e.clientX - startX) / scale;
    const dh = (e.clientY - startY) / scale;
    const newW = Math.max(120, origW + dw);
    const newH = Math.max(80, origH + dh);
    noteEl.style.width = `${newW}px`;
    noteEl.style.height = `${newH}px`;
    const note = notes.get(noteId);
    if (note) {
      note.width = newW;
      note.height = newH;
    }
    refreshConnectorsForNote(noteId);
  });

  handle.addEventListener("pointerup", () => {
    if (resizing) {
      resizing = false;
      const note = notes.get(noteId);
      if (note) {
        socket.emit("note:resize", { id: noteId, width: note.width, height: note.height });
      }
    }
  });
}

// --- Color picker popup ---
let activePickerCleanup: (() => void) | null = null;

function showColorPicker(noteId: string, noteEl: HTMLElement) {
  // Clean up any existing picker and its listener
  if (activePickerCleanup) {
    activePickerCleanup();
    activePickerCleanup = null;
  }

  const popup = document.createElement("div");
  popup.className = "color-picker-popup";

  for (const { hex } of NOTE_COLORS) {
    const btn = document.createElement("button");
    btn.className = "color-btn";
    btn.style.background = hex;
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      socket.emit("note:color", { id: noteId, color: hex });
      applyColorToNoteEl(noteEl, hex);
      const note = notes.get(noteId);
      if (note) note.color = hex;
      cleanup();
    });
    popup.appendChild(btn);
  }

  popup.style.left = `${noteEl.offsetLeft}px`;
  popup.style.top = `${noteEl.offsetTop - 36}px`;
  board.appendChild(popup);

  const close = (e: Event) => {
    if (!popup.contains(e.target as Node)) {
      cleanup();
    }
  };

  function cleanup() {
    popup.remove();
    document.removeEventListener("pointerdown", close);
    activePickerCleanup = null;
  }

  activePickerCleanup = cleanup;
  setTimeout(() => document.addEventListener("pointerdown", close), 0);
}

// --- Connector context menu ---
let activeConnectorMenuCleanup: (() => void) | null = null;

function showConnectorMenu(connectorId: string, clientX: number, clientY: number): void {
  if (activeConnectorMenuCleanup) {
    activeConnectorMenuCleanup();
    activeConnectorMenuCleanup = null;
  }
  const connector = connectors.get(connectorId);
  if (!connector) return;

  const popup = document.createElement("div");
  popup.className = "connector-menu";

  function makeBtn(
    label: string,
    title: string,
    onClick: () => void,
    active = false,
  ): HTMLButtonElement {
    const b = document.createElement("button");
    b.className = "connector-menu-btn";
    b.textContent = label;
    b.title = title;
    if (active) b.classList.add("active");
    b.addEventListener("click", (e) => {
      e.stopPropagation();
      onClick();
      cleanup();
    });
    return b;
  }

  const shapeGroup = document.createElement("div");
  shapeGroup.className = "connector-menu-group";
  shapeGroup.append(
    makeBtn(
      "━",
      "直線",
      () => socket.emit("connector:update", { id: connectorId, shape: "straight" }),
      connector.shape === "straight",
    ),
    makeBtn(
      "⌐",
      "カクカク",
      () => socket.emit("connector:update", { id: connectorId, shape: "elbow" }),
      connector.shape === "elbow",
    ),
    makeBtn(
      "⌒",
      "弧",
      () => socket.emit("connector:update", { id: connectorId, shape: "curved" }),
      connector.shape === "curved",
    ),
  );

  const styleGroup = document.createElement("div");
  styleGroup.className = "connector-menu-group";
  styleGroup.append(
    makeBtn(
      "→",
      "矢印",
      () => socket.emit("connector:update", { id: connectorId, style: "arrow" }),
      connector.style === "arrow",
    ),
    makeBtn(
      "—",
      "線 (矢印なし)",
      () => socket.emit("connector:update", { id: connectorId, style: "line" }),
      connector.style === "line",
    ),
  );

  const deleteBtn = document.createElement("button");
  deleteBtn.className = "connector-menu-btn connector-menu-delete";
  deleteBtn.textContent = "✕";
  deleteBtn.title = "削除";
  deleteBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    socket.emit("connector:delete", { id: connectorId });
    cleanup();
  });

  popup.append(shapeGroup, styleGroup, deleteBtn);

  // Position relative to viewport (popup is fixed so it doesn't transform with the board).
  popup.style.left = `${clientX}px`;
  popup.style.top = `${clientY + 8}px`;
  document.body.appendChild(popup);

  const close = (e: Event) => {
    if (!popup.contains(e.target as Node)) cleanup();
  };

  function cleanup() {
    popup.remove();
    document.removeEventListener("pointerdown", close);
    activeConnectorMenuCleanup = null;
  }

  activeConnectorMenuCleanup = cleanup;
  setTimeout(() => document.addEventListener("pointerdown", close), 0);
}

// --- Cursor tracking ---
const throttledCursorEmit = throttle((x: number, y: number) => {
  socket.emit("cursor:move", { x, y });
}, 30);

boardContainer.addEventListener("pointermove", (e) => {
  if (!socket?.connected) return;
  const rect = boardContainer.getBoundingClientRect();
  const x = (e.clientX - rect.left - panX) / scale;
  const y = (e.clientY - rect.top - panY) / scale;
  throttledCursorEmit(x, y);
});

function renderCursor(data: { id: string; name: string; color: string; x: number; y: number }) {
  let el = cursors.get(data.id);
  if (!el) {
    el = document.createElement("div");
    el.className = "remote-cursor";

    const pointer = document.createElement("div");
    pointer.className = "cursor-pointer";
    pointer.style.color = data.color;

    const label = document.createElement("div");
    label.className = "cursor-label";
    label.style.backgroundColor = data.color;
    label.textContent = data.name;

    el.append(pointer, label);
    board.appendChild(el);
    cursors.set(data.id, el);
  }
  el.style.left = `${data.x}px`;
  el.style.top = `${data.y}px`;
}

// --- User badges ---
const userBadges = new Map<string, HTMLElement>();

function addUserBadge(id: string, name: string, color: string) {
  if (userBadges.has(id)) return;
  const badge = document.createElement("div");
  badge.className = "user-badge";
  badge.style.backgroundColor = color;
  badge.textContent = name.charAt(0).toUpperCase();
  badge.title = name;
  usersList.appendChild(badge);
  userBadges.set(id, badge);
}

function removeUserBadge(id: string) {
  const badge = userBadges.get(id);
  if (badge) {
    badge.remove();
    userBadges.delete(id);
  }
}

// --- Mode toggle ---
function setFrameMode(on: boolean): void {
  frameMode = on;
  document.body.classList.toggle("mode-frame", on);
  frameModeBtn.classList.toggle("active", on);
}

frameModeBtn.addEventListener("click", () => setFrameMode(!frameMode));

// --- Connector rendering ---

function sideNormal(side: AnchorSide): { dx: number; dy: number } {
  switch (side) {
    case "top":
      return { dx: 0, dy: -1 };
    case "right":
      return { dx: 1, dy: 0 };
    case "bottom":
      return { dx: 0, dy: 1 };
    case "left":
      return { dx: -1, dy: 0 };
  }
}

function buildElbowPath(
  s: { x: number; y: number },
  sSide: AnchorSide,
  e: { x: number; y: number },
  eSide: AnchorSide,
): string {
  const offset = 24;
  const sNorm = sideNormal(sSide);
  const eNorm = sideNormal(eSide);
  const sExt = { x: s.x + sNorm.dx * offset, y: s.y + sNorm.dy * offset };
  const eExt = { x: e.x + eNorm.dx * offset, y: e.y + eNorm.dy * offset };
  const sHoriz = sSide === "left" || sSide === "right";
  const eHoriz = eSide === "left" || eSide === "right";
  const middle: { x: number; y: number }[] = [];
  if (sHoriz && eHoriz) {
    const midX = (sExt.x + eExt.x) / 2;
    middle.push({ x: midX, y: sExt.y }, { x: midX, y: eExt.y });
  } else if (!sHoriz && !eHoriz) {
    const midY = (sExt.y + eExt.y) / 2;
    middle.push({ x: sExt.x, y: midY }, { x: eExt.x, y: midY });
  } else if (sHoriz) {
    middle.push({ x: eExt.x, y: sExt.y });
  } else {
    middle.push({ x: sExt.x, y: eExt.y });
  }
  const pts = [s, sExt, ...middle, eExt, e];
  return pts.map((p, i) => `${i === 0 ? "M" : "L"} ${p.x} ${p.y}`).join(" ");
}

function buildCurvedPath(
  s: { x: number; y: number },
  sSide: AnchorSide,
  e: { x: number; y: number },
  eSide: AnchorSide,
): string {
  const dist = Math.hypot(e.x - s.x, e.y - s.y);
  const offset = Math.max(40, dist * 0.4);
  const sNorm = sideNormal(sSide);
  const eNorm = sideNormal(eSide);
  const cp1 = { x: s.x + sNorm.dx * offset, y: s.y + sNorm.dy * offset };
  const cp2 = { x: e.x + eNorm.dx * offset, y: e.y + eNorm.dy * offset };
  return `M ${s.x} ${s.y} C ${cp1.x} ${cp1.y}, ${cp2.x} ${cp2.y}, ${e.x} ${e.y}`;
}

function buildConnectorPath(
  shape: ConnectorShape,
  start: { x: number; y: number },
  startSide: AnchorSide,
  end: { x: number; y: number },
  endSide: AnchorSide,
): string {
  switch (shape) {
    case "elbow":
      return buildElbowPath(start, startSide, end, endSide);
    case "curved":
      return buildCurvedPath(start, startSide, end, endSide);
    default:
      return `M ${start.x} ${start.y} L ${end.x} ${end.y}`;
  }
}

function renderConnector(connector: Connector): void {
  let path = connectorLayer.querySelector(
    `[data-connector-id="${connector.id}"]`,
  ) as SVGPathElement | null;
  const from = notes.get(connector.fromNoteId);
  const to = notes.get(connector.toNoteId);
  if (!from || !to) {
    if (path) path.remove();
    return;
  }
  // Anchor-to-anchor: the line goes from one specific edge midpoint to another,
  // and follows those edges as the notes move (Miro-style edge anchor).
  const start = anchorPoint(from, connector.fromSide);
  const end = anchorPoint(to, connector.toSide);
  const d = buildConnectorPath(connector.shape, start, connector.fromSide, end, connector.toSide);
  if (!path) {
    path = document.createElementNS("http://www.w3.org/2000/svg", "path");
    path.setAttribute("data-connector-id", connector.id);
    path.classList.add("connector-line");
    // Stop pointerdown from bubbling into the board dispatcher (which would
    // otherwise start a marquee selection and swallow the click).
    path.addEventListener("pointerdown", (e) => e.stopPropagation());
    path.addEventListener("click", (e) => {
      e.stopPropagation();
      showConnectorMenu(connector.id, e.clientX, e.clientY);
    });
    connectorLayer.appendChild(path);
  }
  path.setAttribute("d", d);
  path.setAttribute("stroke", connector.color);
  (path as unknown as HTMLElement).style.color = connector.color;
  if (connector.style === "arrow") {
    path.setAttribute("marker-end", "url(#arrowhead)");
  } else {
    path.removeAttribute("marker-end");
  }
}

function removeConnectorEl(id: string): void {
  connectorLayer.querySelector(`[data-connector-id="${id}"]`)?.remove();
}

function refreshConnectorsForNote(noteId: string): void {
  for (const c of connectors.values()) {
    if (c.fromNoteId === noteId || c.toNoteId === noteId) {
      renderConnector(c);
    }
  }
}

function _refreshAllConnectors(): void {
  for (const c of connectors.values()) renderConnector(c);
}

// --- Frame rendering ---
function renderFrame(frame: Frame): HTMLElement {
  let el = document.getElementById(`frame-${frame.id}`);
  if (!el) {
    el = document.createElement("div");
    el.id = `frame-${frame.id}`;
    el.className = "frame-element";

    const title = document.createElement("div");
    title.className = "frame-title";
    title.contentEditable = "true";
    title.spellcheck = false;
    title.addEventListener("pointerdown", (e) => e.stopPropagation());
    title.addEventListener("blur", () => {
      socket.emit("frame:update", { id: frame.id, title: title.textContent || "" });
    });

    const actions = document.createElement("div");
    actions.className = "frame-actions";
    const delBtn = document.createElement("button");
    delBtn.className = "note-action-btn";
    delBtn.textContent = "✕";
    delBtn.title = "Delete frame";
    delBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      socket.emit("frame:delete", { id: frame.id });
    });
    actions.appendChild(delBtn);

    const resize = document.createElement("div");
    resize.className = "frame-resize";

    el.append(title, actions, resize);
    frameLayer.appendChild(el);

    setupFrameDrag(el, frame.id);
    setupFrameResize(resize, el, frame.id);
  }
  el.style.left = `${frame.x}px`;
  el.style.top = `${frame.y}px`;
  el.style.width = `${frame.width}px`;
  el.style.height = `${frame.height}px`;
  el.style.borderColor = frame.color;
  const titleEl = el.querySelector(".frame-title") as HTMLElement;
  if (titleEl && document.activeElement !== titleEl) titleEl.textContent = frame.title;
  return el;
}

function setupFrameDrag(el: HTMLElement, frameId: string): void {
  let dragging = false;
  let startX = 0;
  let startY = 0;
  let origX = 0;
  let origY = 0;
  el.addEventListener("pointerdown", (e) => {
    const target = e.target as HTMLElement;
    if (
      target.classList.contains("frame-resize") ||
      target.classList.contains("frame-title") ||
      target.tagName === "BUTTON"
    )
      return;
    e.stopPropagation();
    dragging = true;
    startX = e.clientX;
    startY = e.clientY;
    const f = frames.get(frameId);
    if (f) {
      origX = f.x;
      origY = f.y;
    }
    el.classList.add("dragging");
    el.setPointerCapture(e.pointerId);
  });
  el.addEventListener("pointermove", (e) => {
    if (!dragging) return;
    const dx = (e.clientX - startX) / scale;
    const dy = (e.clientY - startY) / scale;
    const nx = origX + dx;
    const ny = origY + dy;
    el.style.left = `${nx}px`;
    el.style.top = `${ny}px`;
    const f = frames.get(frameId);
    if (f) {
      f.x = nx;
      f.y = ny;
    }
  });
  el.addEventListener("pointerup", () => {
    if (!dragging) return;
    dragging = false;
    el.classList.remove("dragging");
    const f = frames.get(frameId);
    if (f) socket.emit("frame:update", { id: frameId, x: f.x, y: f.y });
  });
}

function setupFrameResize(handle: HTMLElement, el: HTMLElement, frameId: string): void {
  let resizing = false;
  let startX = 0;
  let startY = 0;
  let origW = 0;
  let origH = 0;
  handle.addEventListener("pointerdown", (e) => {
    e.stopPropagation();
    resizing = true;
    startX = e.clientX;
    startY = e.clientY;
    const f = frames.get(frameId);
    if (f) {
      origW = f.width;
      origH = f.height;
    }
    handle.setPointerCapture(e.pointerId);
  });
  handle.addEventListener("pointermove", (e) => {
    if (!resizing) return;
    const dw = (e.clientX - startX) / scale;
    const dh = (e.clientY - startY) / scale;
    const nw = Math.max(80, origW + dw);
    const nh = Math.max(60, origH + dh);
    el.style.width = `${nw}px`;
    el.style.height = `${nh}px`;
    const f = frames.get(frameId);
    if (f) {
      f.width = nw;
      f.height = nh;
    }
  });
  handle.addEventListener("pointerup", () => {
    if (!resizing) return;
    resizing = false;
    const f = frames.get(frameId);
    if (f) socket.emit("frame:update", { id: frameId, width: f.width, height: f.height });
  });
}

// --- Selection helpers ---
function clearNoteSelection(): void {
  for (const id of selectedNoteIds) {
    document.getElementById(`note-${id}`)?.classList.remove("selected");
  }
  selectedNoteIds.clear();
}

function selectNote(noteId: string, additive: boolean): void {
  if (!additive) clearNoteSelection();
  selectedNoteIds.add(noteId);
  document.getElementById(`note-${noteId}`)?.classList.add("selected");
}

function toggleNoteSelection(noteId: string): void {
  if (selectedNoteIds.has(noteId)) {
    selectedNoteIds.delete(noteId);
    document.getElementById(`note-${noteId}`)?.classList.remove("selected");
  } else {
    selectedNoteIds.add(noteId);
    document.getElementById(`note-${noteId}`)?.classList.add("selected");
  }
}

// --- Wire the unified board-interaction dispatcher (pan / marquee / frame draw) ---
const interactionDeps: InteractionDeps = {
  board,
  boardContainer,
  connectorLayer,
  frameLayer,
  notes,
  getTransform: () => ({ panX, panY, scale }),
  setPan: (x, y) => {
    panX = x;
    panY = y;
    updateTransform();
  },
  isFrameMode: () => frameMode,
  setFrameMode,
  getSocket: () => socket ?? null,
  clearNoteSelection,
  selectNote,
};
setupBoardInteractions(interactionDeps);

// --- Keyboard shortcuts ---
let lastMouseBoardX = 200;
let lastMouseBoardY = 200;

boardContainer.addEventListener("pointermove", (e) => {
  const rect = boardContainer.getBoundingClientRect();
  lastMouseBoardX = (e.clientX - rect.left - panX) / scale;
  lastMouseBoardY = (e.clientY - rect.top - panY) / scale;
});

function isEditingText(): boolean {
  const active = document.activeElement;
  if (!(active instanceof HTMLElement)) return false;
  return active.isContentEditable || active.tagName === "INPUT" || active.tagName === "TEXTAREA";
}

document.addEventListener("keydown", (e) => {
  const active = document.activeElement;
  const editingNote = active instanceof HTMLElement && active.classList.contains("note-text");

  // Ctrl+B inside note text → bold
  if (editingNote && (e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "b") {
    e.preventDefault();
    document.execCommand("bold");
    const noteEl = active.closest(".sticky-note") as HTMLElement | null;
    if (noteEl) {
      const id = noteEl.id.replace(/^note-/, "");
      flushNoteEdit(id, active);
    }
    return;
  }

  if (isEditingText()) return;

  // Ctrl+C / Ctrl+V — copy/paste selected notes
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "c") {
    if (selectedNoteIds.size === 0) return;
    clipboardNotes = Array.from(selectedNoteIds)
      .map((id) => notes.get(id))
      .filter((n): n is StickyNote => Boolean(n))
      .map((n) => ({ ...n }));
    e.preventDefault();
    return;
  }
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "v") {
    if (clipboardNotes.length === 0) return;
    e.preventDefault();
    const minX = Math.min(...clipboardNotes.map((n) => n.x));
    const minY = Math.min(...clipboardNotes.map((n) => n.y));
    for (const n of clipboardNotes) {
      const dx = n.x - minX;
      const dy = n.y - minY;
      socket.emit("note:duplicate", {
        sourceId: n.id,
        x: lastMouseBoardX + dx,
        y: lastMouseBoardY + dy,
      });
    }
    return;
  }

  // Delete / Backspace — delete selected notes
  if ((e.key === "Delete" || e.key === "Backspace") && selectedNoteIds.size > 0) {
    e.preventDefault();
    deleteSelectedNotes();
    return;
  }

  // Ctrl+Z — undo last delete
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "z" && !e.shiftKey) {
    e.preventDefault();
    performUndo();
    return;
  }

  // Esc — exit frame mode / clear selection
  if (e.key === "Escape") {
    setFrameMode(false);
    clearNoteSelection();
    return;
  }

  // F shortcut: toggle frame draw mode
  if (e.key.toLowerCase() === "f" && !e.ctrlKey && !e.metaKey) {
    setFrameMode(!frameMode);
    return;
  }
});

function deleteSelectedNotes(): void {
  const snapshot: StickyNote[] = [];
  for (const id of selectedNoteIds) {
    const n = notes.get(id);
    if (n) snapshot.push({ ...n });
  }
  if (snapshot.length === 0) return;
  pushUndo({ kind: "delete", notes: snapshot });
  for (const n of snapshot) {
    socket.emit("note:delete", { id: n.id });
  }
  selectedNoteIds.clear();
}

function pushUndo(entry: DeleteUndoEntry): void {
  undoStack.push(entry);
  if (undoStack.length > UNDO_LIMIT) undoStack.shift();
}

function performUndo(): void {
  const entry = undoStack.pop();
  if (!entry) return;
  if (entry.kind === "delete") {
    for (const n of entry.notes) {
      socket.emit("note:restore", { note: n });
    }
  }
}

// --- Export ---
exportBtn.addEventListener("click", () => {
  window.open(`/api/boards/${boardId}/export.md`, "_blank");
});

// --- Import ---
let pendingImport: { fileName: string; markdown: string } | null = null;

importBtn.addEventListener("click", () => importFileInput.click());

importFileInput.addEventListener("change", async () => {
  const file = importFileInput.files?.[0];
  if (!file) return;
  importFileInput.value = "";
  const text = await file.text();

  // Cheap pre-validation client-side: count fence blocks for the summary.
  const noteCount = (text.match(/```yaml\s+note\s*\n/g) || []).length;
  const connCount = (text.match(/```yaml\s+connector\s*\n/g) || []).length;
  const frameCount = (text.match(/```yaml\s+frame\s*\n/g) || []).length;

  if (noteCount + connCount + frameCount === 0) {
    alert(
      "インポートできるデータが見つかりません。\nエクスポート済みの Ephemeral Board の Markdown ファイルを選択してください。",
    );
    return;
  }

  pendingImport = { fileName: file.name, markdown: text };
  importSummaryEl.innerHTML =
    `ファイル <b>${escapeHtml(file.name)}</b> をインポートしますか？<br>` +
    `・付箋: ${noteCount} 件<br>` +
    `・コネクタ: ${connCount} 件<br>` +
    `・フレーム: ${frameCount} 件`;
  importConfirmDialog.classList.remove("hidden");
});

importCancelBtn.addEventListener("click", () => {
  pendingImport = null;
  importConfirmDialog.classList.add("hidden");
});

importConfirmBtn.addEventListener("click", async () => {
  if (!pendingImport) return;
  const { markdown } = pendingImport;
  importConfirmDialog.classList.add("hidden");
  pendingImport = null;
  try {
    const res = await fetch(`/api/boards/${boardId}/import`, {
      method: "POST",
      headers: { "Content-Type": "text/markdown" },
      body: markdown,
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: res.statusText }));
      alert(`インポートに失敗しました: ${err.error || res.statusText}`);
      return;
    }
    // Server broadcasts board:sync to all clients including this one.
  } catch (err) {
    alert(`インポートに失敗しました: ${(err as Error).message}`);
  }
});

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

// --- Socket listeners ---
function setupSocketListeners() {
  socket.on(
    "board:sync",
    (data: {
      schemaVersion?: number;
      notes: StickyNote[];
      connectors?: Connector[];
      frames?: Frame[];
      users: Record<string, { name: string; color: string }>;
    }) => {
      // Clear existing
      for (const el of board.querySelectorAll(".sticky-note")) el.remove();
      for (const el of connectorLayer.querySelectorAll("[data-connector-id]")) el.remove();
      for (const el of frameLayer.querySelectorAll(".frame-element")) el.remove();
      notes.clear();
      connectors.clear();
      frames.clear();
      selectedNoteIds.clear();

      for (const note of data.notes) {
        notes.set(note.id, note);
        renderNote(note);
      }
      for (const f of data.frames || []) {
        frames.set(f.id, f);
        renderFrame(f);
      }
      for (const c of data.connectors || []) {
        connectors.set(c.id, c);
        renderConnector(c);
      }

      // Reset existing user badges then re-render
      for (const badge of userBadges.values()) badge.remove();
      userBadges.clear();
      for (const [id, user] of Object.entries(data.users)) {
        addUserBadge(id, user.name, user.color);
      }
    },
  );

  socket.on("note:created", (note: StickyNote) => {
    notes.set(note.id, note);
    renderNote(note);
  });

  socket.on("note:moved", (data: { id: string; x: number; y: number }) => {
    const note = notes.get(data.id);
    if (!note) return;
    note.x = data.x;
    note.y = data.y;
    const el = document.getElementById(`note-${data.id}`);
    if (el) {
      el.style.left = `${data.x}px`;
      el.style.top = `${data.y}px`;
    }
    refreshConnectorsForNote(data.id);
  });

  socket.on("note:edited", (data: { id: string; text: string }) => {
    const note = notes.get(data.id);
    if (!note) return;
    const safe = sanitizeNoteHtml(data.text);
    note.text = safe;
    const el = document.getElementById(`note-${data.id}`);
    if (el) {
      const textEl = el.querySelector(".note-text") as HTMLElement;
      if (textEl && document.activeElement !== textEl) {
        textEl.innerHTML = safe;
      }
    }
  });

  socket.on("note:formatted", (data: { id: string; fontSize?: number; align?: TextAlign }) => {
    const note = notes.get(data.id);
    if (!note) return;
    const el = document.getElementById(`note-${data.id}`);
    const textEl = el?.querySelector(".note-text") as HTMLElement | null;
    if (data.fontSize !== undefined) {
      note.fontSize = data.fontSize;
      if (textEl) textEl.style.fontSize = `${data.fontSize}px`;
    }
    if (data.align !== undefined) {
      note.align = data.align;
      if (textEl) textEl.style.textAlign = data.align;
    }
  });

  socket.on("note:deleted", (data: { id: string; removedConnectorIds?: string[] }) => {
    notes.delete(data.id);
    selectedNoteIds.delete(data.id);
    document.getElementById(`note-${data.id}`)?.remove();
    if (data.removedConnectorIds) {
      for (const cid of data.removedConnectorIds) {
        connectors.delete(cid);
        removeConnectorEl(cid);
      }
    }
  });

  socket.on("note:color-changed", (data: { id: string; color: string }) => {
    const note = notes.get(data.id);
    if (!note) return;
    note.color = data.color;
    const el = document.getElementById(`note-${data.id}`);
    if (el) applyColorToNoteEl(el, data.color);
  });

  socket.on("note:fronted", (data: { id: string; zIndex: number }) => {
    const note = notes.get(data.id);
    if (!note) return;
    note.zIndex = data.zIndex;
    const el = document.getElementById(`note-${data.id}`);
    if (el) el.style.zIndex = String(data.zIndex);
  });

  socket.on("note:resized", (data: { id: string; width: number; height: number }) => {
    const note = notes.get(data.id);
    if (!note) return;
    note.width = data.width;
    note.height = data.height;
    const el = document.getElementById(`note-${data.id}`);
    if (el) {
      el.style.width = `${data.width}px`;
      el.style.height = `${data.height}px`;
    }
    refreshConnectorsForNote(data.id);
  });

  socket.on("connector:created", (c: Connector) => {
    connectors.set(c.id, c);
    renderConnector(c);
  });

  socket.on("connector:deleted", (data: { id: string }) => {
    connectors.delete(data.id);
    removeConnectorEl(data.id);
  });

  socket.on("connector:updated", (c: Connector) => {
    connectors.set(c.id, c);
    renderConnector(c);
  });

  socket.on("frame:created", (f: Frame) => {
    frames.set(f.id, f);
    renderFrame(f);
  });

  socket.on("frame:updated", (f: Frame) => {
    frames.set(f.id, f);
    renderFrame(f);
  });

  socket.on("frame:deleted", (data: { id: string }) => {
    frames.delete(data.id);
    document.getElementById(`frame-${data.id}`)?.remove();
  });

  socket.on("cursor:moved", renderCursor);

  socket.on("user:joined", (data: { id: string; name: string; color: string }) => {
    addUserBadge(data.id, data.name, data.color);
  });

  socket.on("user:left", (data: { id: string }) => {
    removeUserBadge(data.id);
    const cursor = cursors.get(data.id);
    if (cursor) {
      cursor.remove();
      cursors.delete(data.id);
    }
  });
}
