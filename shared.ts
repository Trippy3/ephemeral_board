export const SCHEMA_VERSION = 2;

export type TextAlign = "left" | "center" | "right";
export type ConnectorStyle = "arrow" | "line";

export interface StickyNote {
  id: string;
  text: string;
  x: number;
  y: number;
  width: number;
  height: number;
  color: string;
  createdBy: string;
  createdAt: number;
  updatedAt: number;
  zIndex: number;
  fontSize: number;
  align: TextAlign;
}

export interface Connector {
  id: string;
  fromNoteId: string;
  toNoteId: string;
  style: ConnectorStyle;
  color: string;
  createdAt: number;
  updatedAt: number;
}

export interface Frame {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
  color: string;
  title: string;
  createdAt: number;
  updatedAt: number;
}

export interface BoardSnapshot {
  schemaVersion: number;
  notes: StickyNote[];
  connectors: Connector[];
  frames: Frame[];
}

export const NOTE_COLORS: { hex: string; label: string; dark?: boolean }[] = [
  { hex: "#fef08a", label: "Yellow" },
  { hex: "#fca5a5", label: "Red" },
  { hex: "#86efac", label: "Green" },
  { hex: "#93c5fd", label: "Blue" },
  { hex: "#c4b5fd", label: "Purple" },
  { hex: "#fdba74", label: "Orange" },
  { hex: "#f9a8d4", label: "Pink" },
  { hex: "#ffffff", label: "White" },
  { hex: "#9ca3af", label: "Gray" },
  { hex: "#1f2937", label: "Black", dark: true },
];

export const DEFAULT_FONT_SIZE = 14;
export const DEFAULT_ALIGN: TextAlign = "left";

export const FONT_SIZES = [12, 14, 18, 24] as const;
