import yaml from "js-yaml";
import { z } from "zod";
import { sanitizeNoteHtmlOnServer } from "./sanitize-server.js";
import {
  type AnchorSide,
  type Connector,
  type ConnectorShape,
  type ConnectorStyle,
  DEFAULT_ALIGN,
  DEFAULT_CONNECTOR_SHAPE,
  DEFAULT_FONT_SIZE,
  type Frame,
  type StickyNote,
  type TextAlign,
} from "./shared.js";

const MAX_BYTES = 1_000_000; // 1 MB
const MAX_ELEMENTS = 1000;

const isoToMs = z
  .union([z.string(), z.number(), z.date()])
  .transform((v) => {
    if (typeof v === "number") return v;
    if (v instanceof Date) return v.getTime();
    return Date.parse(v);
  })
  .refine((n) => Number.isFinite(n), { message: "invalid timestamp" });

const noteSchema = z.object({
  id: z.string().min(1).max(64),
  type: z.literal("note"),
  x: z.number().finite(),
  y: z.number().finite(),
  width: z.number().positive().max(10_000),
  height: z.number().positive().max(10_000),
  color: z.string().regex(/^#[0-9a-fA-F]{3,8}$/),
  fontSize: z.number().int().min(8).max(72).optional(),
  align: z.enum(["left", "center", "right"]).optional(),
  createdBy: z.string().max(64).default("Imported"),
  createdAt: isoToMs.optional(),
  updatedAt: isoToMs.optional(),
  zIndex: z.number().int().optional(),
  text: z.string().max(16_000).default(""),
});

const sideSchema = z.enum(["top", "right", "bottom", "left"]);
const shapeSchema = z.enum(["straight", "elbow", "curved"]);

const connectorSchema = z.object({
  id: z.string().min(1).max(64),
  type: z.literal("connector"),
  from: z.string().min(1).max(64),
  to: z.string().min(1).max(64),
  fromSide: sideSchema.optional(),
  toSide: sideSchema.optional(),
  // Snake-case aliases (legacy human-edited files)
  from_side: sideSchema.optional(),
  to_side: sideSchema.optional(),
  shape: shapeSchema.optional(),
  style: z.enum(["arrow", "line"]),
  color: z.string().regex(/^#[0-9a-fA-F]{3,8}$/),
  createdAt: isoToMs.optional(),
  updatedAt: isoToMs.optional(),
});

const frameSchema = z.object({
  id: z.string().min(1).max(64),
  type: z.literal("frame"),
  x: z.number().finite(),
  y: z.number().finite(),
  width: z.number().positive().max(10_000),
  height: z.number().positive().max(10_000),
  color: z.string().regex(/^#[0-9a-fA-F]{3,8}$/),
  title: z.string().max(200).default(""),
  createdAt: isoToMs.optional(),
  updatedAt: isoToMs.optional(),
});

export interface ImportResult {
  notes: StickyNote[];
  connectors: Connector[];
  frames: Frame[];
}

const FENCE_PATTERN = /```yaml\s+(note|connector|frame)\s*\n([\s\S]*?)\n```/g;

export function parseMarkdownImport(markdown: string): ImportResult {
  if (markdown.length > MAX_BYTES) {
    throw new Error(`File too large (${markdown.length} bytes, limit ${MAX_BYTES})`);
  }

  const notes: StickyNote[] = [];
  const connectors: Connector[] = [];
  const frames: Frame[] = [];
  const noteIds = new Set<string>();

  let totalElements = 0;
  for (const m of markdown.matchAll(FENCE_PATTERN)) {
    totalElements++;
    if (totalElements > MAX_ELEMENTS) {
      throw new Error(`Too many elements (limit ${MAX_ELEMENTS})`);
    }
    const kind = m[1];
    const body = m[2];
    let parsed: unknown;
    try {
      parsed = yaml.load(body);
    } catch (err) {
      throw new Error(`YAML parse error in ${kind} block: ${(err as Error).message}`);
    }

    if (kind === "note") {
      const result = noteSchema.safeParse(parsed);
      if (!result.success) {
        throw new Error(`Invalid note block: ${result.error.message}`);
      }
      const v = result.data;
      const now = Date.now();
      notes.push({
        id: v.id,
        text: sanitizeNoteHtmlOnServer(v.text),
        x: v.x,
        y: v.y,
        width: v.width,
        height: v.height,
        color: v.color,
        createdBy: v.createdBy,
        createdAt: v.createdAt ?? now,
        updatedAt: v.updatedAt ?? now,
        zIndex: v.zIndex ?? 1,
        fontSize: v.fontSize ?? DEFAULT_FONT_SIZE,
        align: (v.align ?? DEFAULT_ALIGN) as TextAlign,
      });
      noteIds.add(v.id);
    } else if (kind === "connector") {
      const result = connectorSchema.safeParse(parsed);
      if (!result.success) {
        throw new Error(`Invalid connector block: ${result.error.message}`);
      }
      const v = result.data;
      const now = Date.now();
      connectors.push({
        id: v.id,
        fromNoteId: v.from,
        toNoteId: v.to,
        // Sides may be absent in pre-edge-anchor exports; filled in below.
        fromSide: (v.fromSide ?? v.from_side) as AnchorSide | undefined,
        toSide: (v.toSide ?? v.to_side) as AnchorSide | undefined,
        shape: (v.shape ?? DEFAULT_CONNECTOR_SHAPE) as ConnectorShape,
        style: v.style as ConnectorStyle,
        color: v.color,
        createdAt: v.createdAt ?? now,
        updatedAt: v.updatedAt ?? now,
      } as Connector & { fromSide?: AnchorSide; toSide?: AnchorSide });
    } else if (kind === "frame") {
      const result = frameSchema.safeParse(parsed);
      if (!result.success) {
        throw new Error(`Invalid frame block: ${result.error.message}`);
      }
      const v = result.data;
      const now = Date.now();
      frames.push({
        id: v.id,
        x: v.x,
        y: v.y,
        width: v.width,
        height: v.height,
        color: v.color,
        title: v.title,
        createdAt: v.createdAt ?? now,
        updatedAt: v.updatedAt ?? now,
      });
    }
  }

  // Drop connectors that reference unknown notes (orphan-prevention).
  const filteredConnectors = connectors.filter(
    (c) => noteIds.has(c.fromNoteId) && noteIds.has(c.toNoteId),
  );

  // Fill in sides for legacy connectors that didn't store them.
  const noteById = new Map(notes.map((n) => [n.id, n]));
  for (const c of filteredConnectors) {
    if (!c.fromSide || !c.toSide) {
      const a = noteById.get(c.fromNoteId);
      const b = noteById.get(c.toNoteId);
      if (a && b) {
        const sides = closestSidesBetween(a, b);
        c.fromSide = c.fromSide ?? sides.fromSide;
        c.toSide = c.toSide ?? sides.toSide;
      } else {
        c.fromSide = c.fromSide ?? "right";
        c.toSide = c.toSide ?? "left";
      }
    }
  }

  return { notes, connectors: filteredConnectors, frames };
}

function closestSidesBetween(
  a: StickyNote,
  b: StickyNote,
): { fromSide: AnchorSide; toSide: AnchorSide } {
  const ax = a.x + a.width / 2;
  const ay = a.y + a.height / 2;
  const bx = b.x + b.width / 2;
  const by = b.y + b.height / 2;
  const dx = bx - ax;
  const dy = by - ay;
  const fromSide: AnchorSide =
    Math.abs(dx) > Math.abs(dy) ? (dx >= 0 ? "right" : "left") : dy >= 0 ? "bottom" : "top";
  const opposite: Record<AnchorSide, AnchorSide> = {
    top: "bottom",
    bottom: "top",
    left: "right",
    right: "left",
  };
  return { fromSide, toSide: opposite[fromSide] };
}
