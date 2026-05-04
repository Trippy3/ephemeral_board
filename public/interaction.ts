import type { Socket } from "socket.io-client";
import { ANCHOR_SIDES, type AnchorSide, type StickyNote } from "../shared.js";

export function anchorPoint(note: StickyNote, side: AnchorSide): { x: number; y: number } {
  switch (side) {
    case "top":
      return { x: note.x + note.width / 2, y: note.y };
    case "right":
      return { x: note.x + note.width, y: note.y + note.height / 2 };
    case "bottom":
      return { x: note.x + note.width / 2, y: note.y + note.height };
    case "left":
      return { x: note.x, y: note.y + note.height / 2 };
  }
}

function closestSide(note: StickyNote, boardX: number, boardY: number): AnchorSide {
  let bestSide: AnchorSide = "top";
  let bestDist = Number.POSITIVE_INFINITY;
  for (const side of ANCHOR_SIDES) {
    const p = anchorPoint(note, side);
    const dx = p.x - boardX;
    const dy = p.y - boardY;
    const d = dx * dx + dy * dy;
    if (d < bestDist) {
      bestDist = d;
      bestSide = side;
    }
  }
  return bestSide;
}

export interface BoardTransform {
  panX: number;
  panY: number;
  scale: number;
}

export interface InteractionDeps {
  board: HTMLElement;
  boardContainer: HTMLElement;
  connectorLayer: SVGSVGElement;
  frameLayer: HTMLElement;
  notes: Map<string, StickyNote>;
  getTransform(): BoardTransform;
  setPan(x: number, y: number): void;
  isFrameMode(): boolean;
  setFrameMode(on: boolean): void;
  getSocket(): Socket | null;
  clearNoteSelection(): void;
  selectNote(id: string, additive: boolean): void;
  createNote(boardX: number, boardY: number): void;
}

type TouchPanMeta = {
  startTime: number;
  longPressTimer: ReturnType<typeof setTimeout> | null;
  moved: boolean;
  boardX: number;
  boardY: number;
};

type Drag =
  | {
      kind: "pan";
      pointerId: number;
      startClientX: number;
      startClientY: number;
      origPanX: number;
      origPanY: number;
      tap?: TouchPanMeta;
    }
  | {
      kind: "marquee";
      pointerId: number;
      startBoardX: number;
      startBoardY: number;
      rectEl: HTMLElement;
      additive: boolean;
    }
  | {
      kind: "frame";
      pointerId: number;
      startBoardX: number;
      startBoardY: number;
      rectEl: HTMLElement;
    };

let activeDrag: Drag | null = null;
let isSpaceDown = false;

const TAP_MOVE_THRESHOLD = 8;
const LONG_PRESS_MS = 500;
const DOUBLE_TAP_INTERVAL_MS = 300;
const DOUBLE_TAP_DIST_PX = 30;

const tapHistory = { time: 0, clientX: 0, clientY: 0 };

/**
 * Aborts whatever single-pointer drag (pan / marquee / frame draw) is in
 * progress. Used by the pinch-zoom handler in app.ts when a second touch
 * arrives — the multi-touch gesture takes over and this drag should stop
 * acting on subsequent move events.
 */
export function cancelActiveDrag(boardContainer: HTMLElement): void {
  if (!activeDrag) return;
  const drag = activeDrag;
  activeDrag = null;
  if (drag.kind === "pan") {
    if (drag.tap?.longPressTimer) {
      clearTimeout(drag.tap.longPressTimer);
      drag.tap.longPressTimer = null;
    }
    boardContainer.classList.remove("grabbing");
  } else {
    drag.rectEl.remove();
  }
}

function isEditingText(): boolean {
  const active = document.activeElement;
  if (!(active instanceof HTMLElement)) return false;
  return active.isContentEditable || active.tagName === "INPUT" || active.tagName === "TEXTAREA";
}

function isEmptyBoardTarget(
  target: EventTarget | null,
  container: HTMLElement,
  board: HTMLElement,
  frameLayer: HTMLElement,
): boolean {
  if (!(target instanceof Element)) return false;
  if (target === container || target === board || target === frameLayer) return true;
  // SVG connector layer is pointer-events:none, so events on it shouldn't reach here.
  // Anything inside a sticky-note / frame / popup / draft rect is interactive.
  if (
    target.closest(
      ".sticky-note, .frame-element, .color-picker-popup, .frame-creating-rect, .note-anchor, .connector-line, .connector-menu",
    )
  ) {
    return false;
  }
  return true;
}

export function setupBoardInteractions(deps: InteractionDeps): void {
  const { board, boardContainer, frameLayer } = deps;

  // Suppress browser context menu inside the board so right-click can pan.
  boardContainer.addEventListener("contextmenu", (e) => e.preventDefault());

  // Track Space key for hand-pan mode.
  document.addEventListener("keydown", (e) => {
    if (e.code !== "Space") return;
    if (isEditingText()) return;
    if (!isSpaceDown) {
      isSpaceDown = true;
      boardContainer.classList.add("space-pan");
    }
    // Prevent page scroll on Space when not editing text.
    e.preventDefault();
  });
  document.addEventListener("keyup", (e) => {
    if (e.code !== "Space") return;
    isSpaceDown = false;
    boardContainer.classList.remove("space-pan");
  });
  window.addEventListener("blur", () => {
    isSpaceDown = false;
    boardContainer.classList.remove("space-pan");
  });

  boardContainer.addEventListener("pointerdown", (e) => {
    if (activeDrag) return;
    const t = deps.getTransform();

    // Pan: right click / middle click / Space + left click — anywhere on the board.
    if (e.button === 1 || e.button === 2 || (e.button === 0 && isSpaceDown)) {
      e.preventDefault();
      activeDrag = {
        kind: "pan",
        pointerId: e.pointerId,
        startClientX: e.clientX,
        startClientY: e.clientY,
        origPanX: t.panX,
        origPanY: t.panY,
      };
      boardContainer.setPointerCapture(e.pointerId);
      boardContainer.classList.add("grabbing");
      return;
    }

    if (e.button !== 0) return;

    // Left click on a sticky note / frame / handle: let those handlers run.
    if (!isEmptyBoardTarget(e.target, boardContainer, board, frameLayer)) return;

    const rect = boardContainer.getBoundingClientRect();
    const startBoardX = (e.clientX - rect.left - t.panX) / t.scale;
    const startBoardY = (e.clientY - rect.top - t.panY) / t.scale;

    // Frame draw mode takes priority over marquee on empty area.
    if (deps.isFrameMode()) {
      const rectEl = document.createElement("div");
      rectEl.className = "frame-creating-rect";
      rectEl.style.left = `${startBoardX}px`;
      rectEl.style.top = `${startBoardY}px`;
      rectEl.style.width = "0px";
      rectEl.style.height = "0px";
      board.appendChild(rectEl);
      activeDrag = { kind: "frame", pointerId: e.pointerId, startBoardX, startBoardY, rectEl };
      boardContainer.setPointerCapture(e.pointerId);
      return;
    }

    // Touch on empty area: 1-finger drag pans (no marquee on touch). The same
    // gesture also drives long-press and double-tap note creation, handled in
    // pointermove / finish below using the `tap` metadata.
    if (e.pointerType === "touch") {
      const tap: TouchPanMeta = {
        startTime: Date.now(),
        longPressTimer: null,
        moved: false,
        boardX: startBoardX,
        boardY: startBoardY,
      };
      tap.longPressTimer = setTimeout(() => {
        if (!activeDrag || activeDrag.kind !== "pan" || activeDrag.tap !== tap) return;
        if (tap.moved) return;
        tap.longPressTimer = null;
        deps.createNote(tap.boardX, tap.boardY);
        try {
          boardContainer.releasePointerCapture(activeDrag.pointerId);
        } catch {
          // capture may already be lost; ignore
        }
        boardContainer.classList.remove("grabbing");
        activeDrag = null;
        tapHistory.time = 0;
      }, LONG_PRESS_MS);
      activeDrag = {
        kind: "pan",
        pointerId: e.pointerId,
        startClientX: e.clientX,
        startClientY: e.clientY,
        origPanX: t.panX,
        origPanY: t.panY,
        tap,
      };
      boardContainer.setPointerCapture(e.pointerId);
      boardContainer.classList.add("grabbing");
      return;
    }

    // Marquee selection. Shift = additive. (Mouse only — touch handled above.)
    const rectEl = document.createElement("div");
    rectEl.id = "selection-rect";
    rectEl.style.left = `${startBoardX}px`;
    rectEl.style.top = `${startBoardY}px`;
    rectEl.style.width = "0";
    rectEl.style.height = "0";
    board.appendChild(rectEl);
    activeDrag = {
      kind: "marquee",
      pointerId: e.pointerId,
      startBoardX,
      startBoardY,
      rectEl,
      additive: e.shiftKey,
    };
    boardContainer.setPointerCapture(e.pointerId);
  });

  boardContainer.addEventListener("pointermove", (e) => {
    if (!activeDrag || e.pointerId !== activeDrag.pointerId) return;

    if (activeDrag.kind === "pan") {
      const dx = e.clientX - activeDrag.startClientX;
      const dy = e.clientY - activeDrag.startClientY;
      const tap = activeDrag.tap;
      if (tap && !tap.moved && Math.hypot(dx, dy) > TAP_MOVE_THRESHOLD) {
        tap.moved = true;
        if (tap.longPressTimer) {
          clearTimeout(tap.longPressTimer);
          tap.longPressTimer = null;
        }
      }
      deps.setPan(activeDrag.origPanX + dx, activeDrag.origPanY + dy);
      return;
    }

    const t = deps.getTransform();
    const rect = boardContainer.getBoundingClientRect();
    const cx = (e.clientX - rect.left - t.panX) / t.scale;
    const cy = (e.clientY - rect.top - t.panY) / t.scale;
    const x = Math.min(activeDrag.startBoardX, cx);
    const y = Math.min(activeDrag.startBoardY, cy);
    const w = Math.abs(cx - activeDrag.startBoardX);
    const h = Math.abs(cy - activeDrag.startBoardY);
    activeDrag.rectEl.style.left = `${x}px`;
    activeDrag.rectEl.style.top = `${y}px`;
    activeDrag.rectEl.style.width = `${w}px`;
    activeDrag.rectEl.style.height = `${h}px`;
  });

  const finish = (e: PointerEvent) => {
    if (!activeDrag || e.pointerId !== activeDrag.pointerId) return;
    const drag = activeDrag;
    activeDrag = null;

    if (drag.kind === "pan") {
      boardContainer.classList.remove("grabbing");
      const tap = drag.tap;
      if (!tap) return;
      if (tap.longPressTimer) {
        clearTimeout(tap.longPressTimer);
        tap.longPressTimer = null;
      }
      // pointercancel arrives without a clean tap; skip tap/double-tap logic.
      if (e.type !== "pointerup") {
        tapHistory.time = 0;
        return;
      }
      if (tap.moved || Date.now() - tap.startTime >= LONG_PRESS_MS) return;
      const now = Date.now();
      const distFromLast = Math.hypot(
        e.clientX - tapHistory.clientX,
        e.clientY - tapHistory.clientY,
      );
      if (now - tapHistory.time < DOUBLE_TAP_INTERVAL_MS && distFromLast < DOUBLE_TAP_DIST_PX) {
        deps.createNote(tap.boardX, tap.boardY);
        tapHistory.time = 0;
      } else {
        deps.clearNoteSelection();
        tapHistory.time = now;
        tapHistory.clientX = e.clientX;
        tapHistory.clientY = e.clientY;
      }
      return;
    }

    if (drag.kind === "marquee") {
      const x1 = parseFloat(drag.rectEl.style.left);
      const y1 = parseFloat(drag.rectEl.style.top);
      const x2 = x1 + parseFloat(drag.rectEl.style.width);
      const y2 = y1 + parseFloat(drag.rectEl.style.height);
      drag.rectEl.remove();
      if (!drag.additive) deps.clearNoteSelection();
      for (const note of deps.notes.values()) {
        if (
          note.x + note.width >= x1 &&
          note.x <= x2 &&
          note.y + note.height >= y1 &&
          note.y <= y2
        ) {
          deps.selectNote(note.id, true);
        }
      }
      return;
    }

    if (drag.kind === "frame") {
      const x = parseFloat(drag.rectEl.style.left);
      const y = parseFloat(drag.rectEl.style.top);
      const w = parseFloat(drag.rectEl.style.width);
      const h = parseFloat(drag.rectEl.style.height);
      drag.rectEl.remove();
      if (w > 20 && h > 20) {
        deps.getSocket()?.emit("frame:create", {
          x,
          y,
          width: w,
          height: h,
          color: "#475569",
          title: "Frame",
        });
      }
      deps.setFrameMode(false);
    }
  };

  boardContainer.addEventListener("pointerup", finish);
  boardContainer.addEventListener("pointercancel", finish);
}

/**
 * Adds 4 edge anchors (top/right/bottom/left) onto a sticky-note element.
 * Dragging from an anchor draws a draft connector. While dragging, every other
 * note's anchors are revealed (Miro-style) so the user can pick a specific drop
 * target. On drop, emits `connector:create` with `fromSide` and `toSide` so the
 * line is anchored to those specific edges and follows them as notes move.
 */
export function attachNoteEdgeAnchors(
  noteEl: HTMLElement,
  noteId: string,
  deps: InteractionDeps,
): void {
  for (const side of ANCHOR_SIDES) {
    const anchor = document.createElement("div");
    anchor.className = `note-anchor note-anchor-${side}`;
    anchor.dataset.side = side;

    let draftLine: SVGLineElement | null = null;

    anchor.addEventListener("pointerdown", (e) => {
      if (e.button !== 0) return;
      e.stopPropagation();
      e.preventDefault();
      const note = deps.notes.get(noteId);
      if (!note) return;
      const start = anchorPoint(note, side);
      const line = document.createElementNS("http://www.w3.org/2000/svg", "line");
      line.classList.add("connector-line", "connector-draft");
      line.setAttribute("x1", String(start.x));
      line.setAttribute("y1", String(start.y));
      line.setAttribute("x2", String(start.x));
      line.setAttribute("y2", String(start.y));
      line.setAttribute("stroke", "#475569");
      line.setAttribute("marker-end", "url(#arrowhead)");
      (line as unknown as HTMLElement).style.color = "#475569";
      deps.connectorLayer.appendChild(line);
      draftLine = line;
      // Reveal anchors on every note so the user has explicit drop targets.
      document.body.classList.add("drawing-connector");
      anchor.setPointerCapture(e.pointerId);
    });

    anchor.addEventListener("pointermove", (e) => {
      if (!draftLine) return;
      const t = deps.getTransform();
      const rect = deps.boardContainer.getBoundingClientRect();
      const cx = (e.clientX - rect.left - t.panX) / t.scale;
      const cy = (e.clientY - rect.top - t.panY) / t.scale;
      draftLine.setAttribute("x2", String(cx));
      draftLine.setAttribute("y2", String(cy));

      // Highlight the anchor under the pointer so the user sees the drop target.
      document.querySelectorAll(".note-anchor.drop-target").forEach((el) => {
        el.classList.remove("drop-target");
      });
      const elUnder = document.elementFromPoint(e.clientX, e.clientY);
      const anchorUnder = elUnder?.closest(".note-anchor") as HTMLElement | null;
      if (anchorUnder && anchorUnder !== anchor) {
        anchorUnder.classList.add("drop-target");
      }
    });

    const finishConnector = (e: PointerEvent) => {
      if (!draftLine) return;
      const line = draftLine;
      draftLine = null;
      document.body.classList.remove("drawing-connector");
      document.querySelectorAll(".note-anchor.drop-target").forEach((el) => {
        el.classList.remove("drop-target");
      });
      // Hide the draft line so it doesn't intercept the hit test.
      line.style.display = "none";
      const elUnder = document.elementFromPoint(e.clientX, e.clientY);
      line.remove();

      // Prefer dropping on a specific anchor; fallback to the closest side of the note body.
      const anchorUnder = elUnder?.closest(".note-anchor") as HTMLElement | null;
      const noteUnder = (anchorUnder?.closest(".sticky-note") ??
        elUnder?.closest(".sticky-note")) as HTMLElement | null;
      if (!noteUnder) return;
      const targetId = noteUnder.id.replace(/^note-/, "");
      if (!targetId || targetId === noteId) return;
      const targetNote = deps.notes.get(targetId);
      if (!targetNote) return;

      let toSide: AnchorSide;
      if (anchorUnder) {
        toSide = (anchorUnder.dataset.side as AnchorSide | undefined) ?? "left";
      } else {
        const t = deps.getTransform();
        const rect = deps.boardContainer.getBoundingClientRect();
        const dropBoardX = (e.clientX - rect.left - t.panX) / t.scale;
        const dropBoardY = (e.clientY - rect.top - t.panY) / t.scale;
        toSide = closestSide(targetNote, dropBoardX, dropBoardY);
      }

      deps.getSocket()?.emit("connector:create", {
        fromNoteId: noteId,
        toNoteId: targetId,
        fromSide: side,
        toSide,
        style: "arrow",
        color: "#475569",
      });
    };

    anchor.addEventListener("pointerup", finishConnector);
    anchor.addEventListener("pointercancel", () => {
      if (draftLine) draftLine.remove();
      draftLine = null;
      document.body.classList.remove("drawing-connector");
      document.querySelectorAll(".note-anchor.drop-target").forEach((el) => {
        el.classList.remove("drop-target");
      });
    });

    noteEl.appendChild(anchor);
  }
}
