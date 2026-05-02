import yaml from "js-yaml";
import { z } from "zod";
import { sanitizeNoteHtmlOnServer } from "./sanitize-server.js";
import {
  type Connector,
  type ConnectorStyle,
  DEFAULT_ALIGN,
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

const connectorSchema = z.object({
  id: z.string().min(1).max(64),
  type: z.literal("connector"),
  from: z.string().min(1).max(64),
  to: z.string().min(1).max(64),
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
        style: v.style as ConnectorStyle,
        color: v.color,
        createdAt: v.createdAt ?? now,
        updatedAt: v.updatedAt ?? now,
      });
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

  return { notes, connectors: filteredConnectors, frames };
}
