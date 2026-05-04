import { describe, expect, it } from "vitest";
import { SCHEMA_VERSION } from "../../shared.js";

describe("smoke", () => {
  it("test toolchain is wired up", () => {
    expect(typeof SCHEMA_VERSION).toBe("number");
    expect(SCHEMA_VERSION).toBeGreaterThanOrEqual(1);
  });
});
