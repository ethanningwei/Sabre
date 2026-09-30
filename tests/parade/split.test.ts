import { describe, expect, it } from "vitest";
import { renderParadeState, splitMessage, SECTION_SEPARATOR } from "@/lib/parade";
import { EXAMPLE_CAA, exampleSnapshot } from "../fixtures/example-snapshot";

describe("splitMessage", () => {
  it("keeps a short message whole", () => {
    expect(splitMessage("hello")).toEqual(["hello"]);
  });

  it("splits at subunit boundaries and loses nothing", () => {
    const text = renderParadeState(exampleSnapshot(), EXAMPLE_CAA);
    const chunks = splitMessage(text, 1500);
    expect(chunks.length).toBeGreaterThan(1);
    expect(chunks.join("")).toBe(text);
    for (const c of chunks) expect(c.length).toBeLessThanOrEqual(1500);
    for (const c of chunks.slice(1)) expect(c.startsWith(SECTION_SEPARATOR)).toBe(true);
  });

  it("falls back to lines when there are no separators", () => {
    const text = Array.from({ length: 100 }, (_, i) => `line ${i}`).join("\n");
    const chunks = splitMessage(text, 100);
    expect(chunks.every((c) => c.length <= 100)).toBe(true);
    expect(chunks.join("\n")).toBe(text);
  });
});
