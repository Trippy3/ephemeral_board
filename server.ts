import { createServer } from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import express from "express";
import { Server } from "socket.io";
import { exportAsMarkdown } from "./export.js";
import { parseMarkdownImport } from "./import.js";
import { sanitizeNoteHtmlOnServer } from "./sanitize-server.js";
import {
  ANCHOR_SIDES,
  type AnchorSide,
  CONNECTOR_SHAPES,
  type ConnectorShape,
  type ConnectorStyle,
  FONT_SIZES,
  type StickyNote,
  type TextAlign,
} from "./shared.js";
import {
  assignUserColor,
  bringToFront,
  changeNoteColor,
  createConnector,
  createFrame,
  createNote,
  deleteConnector,
  deleteFrame,
  deleteNote,
  duplicateNote,
  editNote,
  formatNote,
  getBoardSnapshot,
  getOrCreateBoard,
  moveNote,
  replaceBoard,
  resizeNote,
  restoreNote,
  startCleanup,
  updateConnector,
  updateFrame,
} from "./state.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const server = createServer(app);
const io = new Server(server, {
  cors: { origin: "*" },
});

const PORT = parseInt(process.env.PORT || "3000", 10);

app.use(express.static(path.join(__dirname, "public")));
app.use(
  "/api/boards/:boardId/import",
  express.text({ type: ["text/*", "application/octet-stream"], limit: "1mb" }),
);

// Markdown export
app.get("/api/boards/:boardId/export.md", (req, res) => {
  const md = exportAsMarkdown(req.params.boardId);
  res.setHeader("Content-Type", "text/markdown; charset=utf-8");
  res.setHeader("Content-Disposition", `attachment; filename="board-${req.params.boardId}.md"`);
  res.send(md);
});

// Markdown import (replace board)
app.post("/api/boards/:boardId/import", (req, res) => {
  const boardId = req.params.boardId;
  const body = typeof req.body === "string" ? req.body : "";
  if (!body) {
    return res.status(400).json({ error: "Empty body" });
  }
  let parsed: ReturnType<typeof parseMarkdownImport>;
  try {
    parsed = parseMarkdownImport(body);
  } catch (err) {
    return res.status(400).json({ error: (err as Error).message });
  }
  replaceBoard(boardId, parsed);
  const snapshot = getBoardSnapshot(boardId);
  const users = boardUsers.get(boardId);
  io.to(boardId).emit("board:sync", {
    schemaVersion: snapshot.schemaVersion,
    notes: snapshot.notes,
    connectors: snapshot.connectors,
    frames: snapshot.frames,
    users: users ? Object.fromEntries(users) : {},
  });
  res.json({
    success: true,
    notes: parsed.notes.length,
    connectors: parsed.connectors.length,
    frames: parsed.frames.length,
  });
});

// Track connected users per board
const boardUsers = new Map<string, Map<string, { name: string; color: string }>>();

io.on("connection", (socket) => {
  let currentBoard: string | null = null;
  let userName = "";
  const userColor = assignUserColor();

  socket.on("board:join", (data: { boardId: string; name: string }) => {
    currentBoard = data.boardId;
    userName = data.name || `User ${socket.id.slice(0, 4)}`;

    getOrCreateBoard(currentBoard);
    socket.join(currentBoard);

    // Track user
    if (!boardUsers.has(currentBoard)) {
      boardUsers.set(currentBoard, new Map());
    }
    boardUsers.get(currentBoard)!.set(socket.id, { name: userName, color: userColor });

    // Send full state
    const snapshot = getBoardSnapshot(currentBoard);
    socket.emit("board:sync", {
      schemaVersion: snapshot.schemaVersion,
      notes: snapshot.notes,
      connectors: snapshot.connectors,
      frames: snapshot.frames,
      users: Object.fromEntries(boardUsers.get(currentBoard)!),
    });

    // Notify others
    socket.to(currentBoard).emit("user:joined", {
      id: socket.id,
      name: userName,
      color: userColor,
    });
  });

  socket.on("note:create", (data: { x: number; y: number; color: string }) => {
    if (!currentBoard) return;
    const note = createNote(currentBoard, { ...data, createdBy: userName });
    io.to(currentBoard).emit("note:created", note);
  });

  socket.on("note:move", (data: { id: string; x: number; y: number }) => {
    if (!currentBoard) return;
    const note = moveNote(currentBoard, data.id, data.x, data.y);
    if (note) {
      socket.to(currentBoard).emit("note:moved", { id: data.id, x: data.x, y: data.y });
    }
  });

  socket.on("note:edit", (data: { id: string; text: string }) => {
    if (!currentBoard) return;
    const safeText = sanitizeNoteHtmlOnServer(data.text);
    const note = editNote(currentBoard, data.id, safeText);
    if (note) {
      socket.to(currentBoard).emit("note:edited", { id: data.id, text: safeText });
    }
  });

  socket.on("note:format", (data: { id: string; fontSize?: number; align?: TextAlign }) => {
    if (!currentBoard) return;
    const allowedSize =
      data.fontSize !== undefined && (FONT_SIZES as readonly number[]).includes(data.fontSize)
        ? data.fontSize
        : undefined;
    const allowedAlign =
      data.align === "left" || data.align === "center" || data.align === "right"
        ? data.align
        : undefined;
    if (allowedSize === undefined && allowedAlign === undefined) return;
    const note = formatNote(currentBoard, data.id, {
      fontSize: allowedSize,
      align: allowedAlign,
    });
    if (note) {
      io.to(currentBoard).emit("note:formatted", {
        id: data.id,
        fontSize: allowedSize,
        align: allowedAlign,
      });
    }
  });

  socket.on("note:delete", (data: { id: string }) => {
    if (!currentBoard) return;
    const result = deleteNote(currentBoard, data.id);
    if (result.deleted) {
      io.to(currentBoard).emit("note:deleted", {
        id: data.id,
        removedConnectorIds: result.removedConnectorIds,
      });
    }
  });

  socket.on("note:color", (data: { id: string; color: string }) => {
    if (!currentBoard) return;
    const note = changeNoteColor(currentBoard, data.id, data.color);
    if (note) {
      socket.to(currentBoard).emit("note:color-changed", { id: data.id, color: data.color });
    }
  });

  socket.on("note:front", (data: { id: string }) => {
    if (!currentBoard) return;
    const zIndex = bringToFront(currentBoard, data.id);
    if (zIndex !== null) {
      io.to(currentBoard).emit("note:fronted", { id: data.id, zIndex });
    }
  });

  socket.on("note:resize", (data: { id: string; width: number; height: number }) => {
    if (!currentBoard) return;
    const note = resizeNote(currentBoard, data.id, data.width, data.height);
    if (note) {
      socket.to(currentBoard).emit("note:resized", {
        id: data.id,
        width: data.width,
        height: data.height,
      });
    }
  });

  socket.on("note:duplicate", (data: { sourceId: string; x: number; y: number }) => {
    if (!currentBoard) return;
    const board = getOrCreateBoard(currentBoard);
    const source = board.notes.get(data.sourceId);
    if (!source) return;
    const note = duplicateNote(
      currentBoard,
      {
        text: source.text,
        color: source.color,
        width: source.width,
        height: source.height,
        fontSize: source.fontSize,
        align: source.align,
      },
      { x: data.x, y: data.y, createdBy: userName },
    );
    io.to(currentBoard).emit("note:created", note);
  });

  socket.on("note:restore", (data: { note: StickyNote }) => {
    if (!currentBoard) return;
    const safeText = sanitizeNoteHtmlOnServer(data.note.text);
    const restored = restoreNote(currentBoard, { ...data.note, text: safeText });
    if (restored) {
      io.to(currentBoard).emit("note:created", restored);
    }
  });

  socket.on(
    "connector:create",
    (data: {
      fromNoteId: string;
      toNoteId: string;
      fromSide: AnchorSide;
      toSide: AnchorSide;
      shape?: ConnectorShape;
      style: ConnectorStyle;
      color: string;
    }) => {
      if (!currentBoard) return;
      if (!ANCHOR_SIDES.includes(data.fromSide) || !ANCHOR_SIDES.includes(data.toSide)) return;
      const allowedShape =
        data.shape !== undefined && CONNECTOR_SHAPES.includes(data.shape) ? data.shape : undefined;
      const connector = createConnector(currentBoard, { ...data, shape: allowedShape });
      if (connector) {
        io.to(currentBoard).emit("connector:created", connector);
      }
    },
  );

  socket.on("connector:delete", (data: { id: string }) => {
    if (!currentBoard) return;
    if (deleteConnector(currentBoard, data.id)) {
      io.to(currentBoard).emit("connector:deleted", { id: data.id });
    }
  });

  socket.on(
    "connector:update",
    (data: { id: string; style?: ConnectorStyle; shape?: ConnectorShape; color?: string }) => {
      if (!currentBoard) return;
      const allowedStyle = data.style === "arrow" || data.style === "line" ? data.style : undefined;
      const allowedShape =
        data.shape !== undefined && CONNECTOR_SHAPES.includes(data.shape) ? data.shape : undefined;
      const allowedColor =
        typeof data.color === "string" && /^#[0-9a-fA-F]{3,8}$/.test(data.color)
          ? data.color
          : undefined;
      if (allowedStyle === undefined && allowedShape === undefined && allowedColor === undefined) {
        return;
      }
      const updated = updateConnector(currentBoard, data.id, {
        style: allowedStyle,
        shape: allowedShape,
        color: allowedColor,
      });
      if (updated) {
        io.to(currentBoard).emit("connector:updated", updated);
      }
    },
  );

  socket.on(
    "frame:create",
    (data: {
      x: number;
      y: number;
      width: number;
      height: number;
      color: string;
      title: string;
    }) => {
      if (!currentBoard) return;
      const frame = createFrame(currentBoard, data);
      io.to(currentBoard).emit("frame:created", frame);
    },
  );

  socket.on(
    "frame:update",
    (data: {
      id: string;
      x?: number;
      y?: number;
      width?: number;
      height?: number;
      color?: string;
      title?: string;
    }) => {
      if (!currentBoard) return;
      const { id, ...changes } = data;
      const frame = updateFrame(currentBoard, id, changes);
      if (frame) {
        socket.to(currentBoard).emit("frame:updated", frame);
      }
    },
  );

  socket.on("frame:delete", (data: { id: string }) => {
    if (!currentBoard) return;
    if (deleteFrame(currentBoard, data.id)) {
      io.to(currentBoard).emit("frame:deleted", { id: data.id });
    }
  });

  socket.on("cursor:move", (data: { x: number; y: number }) => {
    if (!currentBoard) return;
    socket.to(currentBoard).emit("cursor:moved", {
      id: socket.id,
      name: userName,
      color: userColor,
      x: data.x,
      y: data.y,
    });
  });

  socket.on("disconnect", () => {
    if (currentBoard) {
      const users = boardUsers.get(currentBoard);
      if (users) {
        users.delete(socket.id);
        if (users.size === 0) boardUsers.delete(currentBoard);
      }
      socket.to(currentBoard).emit("user:left", { id: socket.id });
    }
  });
});

startCleanup();

server.listen(PORT, "0.0.0.0", () => {
  console.log(`Ephemeral Board running at http://localhost:${PORT}`);
});
