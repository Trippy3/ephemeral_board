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
}

export const NOTE_COLORS: { hex: string; label: string }[] = [
  { hex: "#fef08a", label: "Yellow" },
  { hex: "#fca5a5", label: "Red" },
  { hex: "#86efac", label: "Green" },
  { hex: "#93c5fd", label: "Blue" },
  { hex: "#c4b5fd", label: "Purple" },
  { hex: "#fdba74", label: "Orange" },
  { hex: "#f9a8d4", label: "Pink" },
];
