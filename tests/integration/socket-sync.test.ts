import type { AddressInfo } from "node:net";
import { io as ioClient, type Socket } from "socket.io-client";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { server, io as serverIo } from "../../server.js";

let port: number;

function newBoardId(): string {
  return `it-sock-${Math.random().toString(36).slice(2, 10)}`;
}

beforeAll(async () => {
  await new Promise<void>((resolve) => server.listen(0, resolve));
  port = (server.address() as AddressInfo).port;
});

afterAll(async () => {
  serverIo.close();
  await new Promise<void>((resolve, reject) => {
    server.close((err) => (err ? reject(err) : resolve()));
  });
});

function connect(boardId: string): Promise<Socket> {
  return new Promise((resolve, reject) => {
    const socket = ioClient(`http://localhost:${port}`, {
      transports: ["websocket"],
      forceNew: true,
      reconnection: false,
    });
    socket.on("connect", () => {
      socket.once("board:sync", () => resolve(socket));
      socket.emit("board:join", { boardId, name: "T" });
    });
    socket.on("connect_error", reject);
  });
}

function once<T = unknown>(s: Socket, event: string): Promise<T> {
  return new Promise((resolve) => s.once(event, (data: T) => resolve(data)));
}

describe("Socket.IO sync contracts", () => {
  it("note:create on A is broadcast as note:created to B (and A gets the echo)", async () => {
    const board = newBoardId();
    const a = await connect(board);
    const b = await connect(board);

    const onB = once<{ id: string; x: number; y: number }>(b, "note:created");
    a.emit("note:create", { x: 11, y: 22, color: "#fef08a" });
    const note = await onB;
    expect(note.x).toBe(11);
    expect(note.y).toBe(22);

    a.disconnect();
    b.disconnect();
  });

  it("note:delete broadcasts removedConnectorIds for cascade (CORE INVARIANT #2)", async () => {
    const board = newBoardId();
    const a = await connect(board);
    const b = await connect(board);

    const noteACreated = once<{ id: string }>(a, "note:created");
    a.emit("note:create", { x: 0, y: 0, color: "#ffffff" });
    const noteA = await noteACreated;

    const noteBCreated = once<{ id: string }>(a, "note:created");
    a.emit("note:create", { x: 200, y: 0, color: "#ffffff" });
    const noteB = await noteBCreated;

    const conn = once<{ id: string }>(a, "connector:created");
    a.emit("connector:create", {
      fromNoteId: noteA.id,
      toNoteId: noteB.id,
      fromSide: "right",
      toSide: "left",
      style: "arrow",
      color: "#000000",
    });
    const connector = await conn;

    const deleted = once<{ id: string; removedConnectorIds: string[] }>(b, "note:deleted");
    a.emit("note:delete", { id: noteA.id });
    const evt = await deleted;
    expect(evt.id).toBe(noteA.id);
    expect(evt.removedConnectorIds).toEqual([connector.id]);

    a.disconnect();
    b.disconnect();
  });

  it("note:edit from A produces note:edited event on B (broadcast contract)", async () => {
    const board = newBoardId();
    const a = await connect(board);
    const b = await connect(board);

    const created = once<{ id: string }>(b, "note:created");
    a.emit("note:create", { x: 0, y: 0, color: "#ffffff" });
    const note = await created;

    const edited = once<{ id: string; text: string }>(b, "note:edited");
    a.emit("note:edit", { id: note.id, text: "<b>hi</b>" });
    const evt = await edited;
    expect(evt.id).toBe(note.id);
    expect(evt.text).toBe("<b>hi</b>");

    a.disconnect();
    b.disconnect();
  });

  it("disconnect emits user:left to remaining clients", async () => {
    const board = newBoardId();
    const a = await connect(board);
    const b = await connect(board);

    const left = once<{ id: string }>(a, "user:left");
    b.disconnect();
    const evt = await left;
    expect(evt.id).toBeDefined();

    a.disconnect();
  });
});
