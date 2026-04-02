import express from "express";
import { createServer } from "http";
import { Server } from "socket.io";
import path from "path";
import { fileURLToPath } from "url";
import {
  getOrCreateBoard,
  getBoardSnapshot,
  createNote,
  moveNote,
  editNote,
  deleteNote,
  changeNoteColor,
  bringToFront,
  resizeNote,
  assignUserColor,
  startCleanup,
} from "./state.js";
import { exportAsMarkdown } from "./export.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const server = createServer(app);
const io = new Server(server, {
  cors: { origin: "*" },
});

const PORT = parseInt(process.env.PORT || "3000", 10);

app.use(express.static(path.join(__dirname, "public")));

// Markdown export
app.get("/api/boards/:boardId/export.md", (req, res) => {
  const md = exportAsMarkdown(req.params.boardId);
  res.setHeader("Content-Type", "text/markdown; charset=utf-8");
  res.setHeader(
    "Content-Disposition",
    `attachment; filename="board-${req.params.boardId}.md"`
  );
  res.send(md);
});

// Track connected users per board
const boardUsers = new Map<string, Map<string, { name: string; color: string }>>();

io.on("connection", (socket) => {
  let currentBoard: string | null = null;
  let userName = "";
  let userColor = assignUserColor();

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
    socket.emit("board:sync", {
      notes: getBoardSnapshot(currentBoard),
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
    const note = editNote(currentBoard, data.id, data.text);
    if (note) {
      socket.to(currentBoard).emit("note:edited", { id: data.id, text: data.text });
    }
  });

  socket.on("note:delete", (data: { id: string }) => {
    if (!currentBoard) return;
    if (deleteNote(currentBoard, data.id)) {
      io.to(currentBoard).emit("note:deleted", { id: data.id });
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
  console.log(`Sticky Board running at http://localhost:${PORT}`);
});
