import { io, Socket } from "socket.io-client";
import { StickyNote, NOTE_COLORS } from "../shared.js";

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
let boardId = location.pathname.slice(1) || "default";
let selectedColor = "#fef08a";
let scale = 1;
let panX = 0;
let panY = 0;
const notes = new Map<string, StickyNote>();
const cursors = new Map<string, HTMLElement>();

// --- DOM refs ---
const board = document.getElementById("board")!;
const boardContainer = document.getElementById("board-container")!;
const nameDialog = document.getElementById("name-dialog")!;
const nameInput = document.getElementById("name-input") as HTMLInputElement;
const nameSubmit = document.getElementById("name-submit")!;
const usersList = document.getElementById("users-list")!;
const exportBtn = document.getElementById("export-btn")!;
const zoomInBtn = document.getElementById("zoom-in-btn")!;
const zoomOutBtn = document.getElementById("zoom-out-btn")!;
const zoomResetBtn = document.getElementById("zoom-reset-btn")!;

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

// Pan
let isPanning = false;
let panStartX = 0;
let panStartY = 0;

boardContainer.addEventListener("pointerdown", (e) => {
  if (e.target !== boardContainer && e.target !== board) return;
  isPanning = true;
  panStartX = e.clientX - panX;
  panStartY = e.clientY - panY;
  boardContainer.classList.add("grabbing");
  boardContainer.setPointerCapture(e.pointerId);
});

boardContainer.addEventListener("pointermove", (e) => {
  if (!isPanning) return;
  panX = e.clientX - panStartX;
  panY = e.clientY - panStartY;
  updateTransform();
});

boardContainer.addEventListener("pointerup", () => {
  if (isPanning) {
    isPanning = false;
    boardContainer.classList.remove("grabbing");
  }
});

// Zoom
boardContainer.addEventListener("wheel", (e) => {
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
}, { passive: false });

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
function renderNote(note: StickyNote): HTMLElement {
  const el = document.createElement("div");
  el.className = "sticky-note";
  el.id = `note-${note.id}`;
  el.style.left = `${note.x}px`;
  el.style.top = `${note.y}px`;
  el.style.width = `${note.width}px`;
  el.style.height = `${note.height}px`;
  el.style.backgroundColor = note.color;
  el.style.zIndex = String(note.zIndex);

  // Header
  const header = document.createElement("div");
  header.className = "note-header";

  const author = document.createElement("span");
  author.className = "note-author";
  author.textContent = note.createdBy;

  const actions = document.createElement("div");
  actions.className = "note-actions";

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
  deleteBtn.title = "Delete";
  deleteBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    socket.emit("note:delete", { id: note.id });
  });

  actions.append(colorBtn, deleteBtn);
  header.append(author, actions);

  // Text
  const text = document.createElement("div");
  text.className = "note-text";
  text.contentEditable = "true";
  text.textContent = note.text;

  let editTimeout: ReturnType<typeof setTimeout>;
  text.addEventListener("input", () => {
    clearTimeout(editTimeout);
    editTimeout = setTimeout(() => {
      const noteData = notes.get(note.id);
      if (noteData) {
        noteData.text = text.innerText || "";
        socket.emit("note:edit", { id: note.id, text: noteData.text });
      }
    }, 300);
  });

  text.addEventListener("pointerdown", (e) => e.stopPropagation());

  // Resize handle
  const resizeHandle = document.createElement("div");
  resizeHandle.className = "resize-handle";
  setupResize(resizeHandle, note.id, el);

  el.append(header, text, resizeHandle);

  // Drag from header or note background (not text)
  setupDrag(el, note.id, el);

  board.appendChild(el);
  return el;
}

// --- Drag ---
function setupDrag(handle: HTMLElement, noteId: string, noteEl: HTMLElement) {
  let dragging = false;
  let startX = 0;
  let startY = 0;
  let origX = 0;
  let origY = 0;

  const throttledMoveEmit = throttle((x: number, y: number) => {
    socket.emit("note:move", { id: noteId, x, y });
  }, 30);

  handle.addEventListener("pointerdown", (e) => {
    const target = e.target as HTMLElement;
    if (
      target.classList.contains("note-text") ||
      target.classList.contains("note-action-btn") ||
      target.classList.contains("resize-handle") ||
      target.contentEditable === "true"
    ) return;

    e.stopPropagation();
    dragging = true;
    startX = e.clientX;
    startY = e.clientY;
    const note = notes.get(noteId);
    if (note) {
      origX = note.x;
      origY = note.y;
    }
    noteEl.classList.add("dragging");
    handle.setPointerCapture(e.pointerId);

    socket.emit("note:front", { id: noteId });
  });

  handle.addEventListener("pointermove", (e) => {
    if (!dragging) return;
    const dx = (e.clientX - startX) / scale;
    const dy = (e.clientY - startY) / scale;
    const newX = origX + dx;
    const newY = origY + dy;
    noteEl.style.left = `${newX}px`;
    noteEl.style.top = `${newY}px`;
    const note = notes.get(noteId);
    if (note) {
      note.x = newX;
      note.y = newY;
    }
    throttledMoveEmit(newX, newY);
  });

  handle.addEventListener("pointerup", () => {
    if (dragging) {
      dragging = false;
      noteEl.classList.remove("dragging");
      // Send final position to ensure accuracy
      const note = notes.get(noteId);
      if (note) {
        socket.emit("note:move", { id: noteId, x: note.x, y: note.y });
      }
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
      noteEl.style.backgroundColor = hex;
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

// --- Export ---
exportBtn.addEventListener("click", () => {
  window.open(`/api/boards/${boardId}/export.md`, "_blank");
});

// --- Socket listeners ---
function setupSocketListeners() {
  socket.on("board:sync", (data: { notes: StickyNote[]; users: Record<string, { name: string; color: string }> }) => {
    // Clear existing
    board.querySelectorAll(".sticky-note").forEach((el) => el.remove());
    notes.clear();

    for (const note of data.notes) {
      notes.set(note.id, note);
      renderNote(note);
    }

    // Render user badges
    for (const [id, user] of Object.entries(data.users)) {
      addUserBadge(id, user.name, user.color);
    }
  });

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
  });

  socket.on("note:edited", (data: { id: string; text: string }) => {
    const note = notes.get(data.id);
    if (!note) return;
    note.text = data.text;
    const el = document.getElementById(`note-${data.id}`);
    if (el) {
      const textEl = el.querySelector(".note-text") as HTMLElement;
      if (textEl && document.activeElement !== textEl) {
        textEl.innerText = data.text;
      }
    }
  });

  socket.on("note:deleted", (data: { id: string }) => {
    notes.delete(data.id);
    document.getElementById(`note-${data.id}`)?.remove();
  });

  socket.on("note:color-changed", (data: { id: string; color: string }) => {
    const note = notes.get(data.id);
    if (!note) return;
    note.color = data.color;
    const el = document.getElementById(`note-${data.id}`);
    if (el) el.style.backgroundColor = data.color;
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
