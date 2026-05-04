import { describe, expect, it } from "vitest";
import { anchorPoint } from "../../public/interaction.js";
import type { StickyNote } from "../../shared.js";

const note: StickyNote = {
  id: "n1",
  text: "",
  x: 100,
  y: 200,
  width: 200,
  height: 100,
  color: "#fef08a",
  createdBy: "U",
  createdAt: 0,
  updatedAt: 0,
  zIndex: 1,
  fontSize: 14,
  align: "left",
};

describe("anchorPoint", () => {
  it("top edge midpoint", () => {
    expect(anchorPoint(note, "top")).toEqual({ x: 200, y: 200 });
  });
  it("right edge midpoint", () => {
    expect(anchorPoint(note, "right")).toEqual({ x: 300, y: 250 });
  });
  it("bottom edge midpoint", () => {
    expect(anchorPoint(note, "bottom")).toEqual({ x: 200, y: 300 });
  });
  it("left edge midpoint", () => {
    expect(anchorPoint(note, "left")).toEqual({ x: 100, y: 250 });
  });

  it("top and bottom share the x coordinate (horizontal centre)", () => {
    const t = anchorPoint(note, "top");
    const b = anchorPoint(note, "bottom");
    expect(t.x).toBe(b.x);
  });

  it("left and right share the y coordinate (vertical centre)", () => {
    const l = anchorPoint(note, "left");
    const r = anchorPoint(note, "right");
    expect(l.y).toBe(r.y);
  });
});
