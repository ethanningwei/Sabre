import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { renderParadeState, validate } from "@/lib/parade";
import { EXAMPLE_CAA, absent, camp, exampleSnapshot, present, subunit, duty } from "../fixtures/example-snapshot";
import type { CoySnapshot } from "@/lib/parade/types";

const golden = readFileSync(join(__dirname, "../fixtures/example-300926.txt"), "utf8");

function coy(subunits: CoySnapshot["subunits"], duties: CoySnapshot["duties"] = []): CoySnapshot {
  return { coy: { id: "c", key: "T", displayName: "Test" }, subunits, duties };
}

describe("renderParadeState", () => {
  it("matches the bot's real 300926 1100H output character for character", () => {
    const snap = exampleSnapshot();
    expect(validate(snap, EXAMPLE_CAA)).toEqual([]);
    expect(renderParadeState(snap, EXAMPLE_CAA)).toBe(golden);
  });

  it("prints MA with and without a location", () => {
    const text = renderParadeState(
      coy([
        subunit("PLATOON 1", [
          camp("A", [
            absent("PTE ONE", { type: "MA", maTiming: "1300" }),
            absent("PTE TWO", { type: "MA", maTiming: "0900", maLocation: "CMPB" }),
          ]),
        ]),
      ]),
      EXAMPLE_CAA,
    );
    expect(text).toContain("1. PTE ONE (1300H MA)\n\n2. PTE TWO (0900H MA @ CMPB)\n");
  });

  it("drops times unless all four date/time parts are present", () => {
    const text = renderParadeState(
      coy([subunit("PLATOON 1", [camp("A", [absent("PTE X", { type: "MC", start: "290926 2100", end: "011026" })])])]),
      EXAMPLE_CAA,
    );
    expect(text).toContain("1. PTE X (MC 290926 - 011026)");
  });

  it("OTHERS with full date/times, and with only a start date", () => {
    const text = renderParadeState(
      coy([
        subunit("PLATOON 1", [
          camp("A", [
            absent("PTE X", { type: "OTHERS", reason: "COURSE", start: "290926 0800", end: "011026 1700" }),
            absent("PTE Y", { type: "OTHERS", reason: "ENGAGEMENT", start: "290926" }),
          ]),
        ]),
      ]),
      EXAMPLE_CAA,
    );
    expect(text).toContain("1. PTE X (COURSE 290926 0800H - 011026 1700H)");
    expect(text).toContain("2. PTE Y (ENGAGEMENT)");
  });

  it("prints Serving Extra and shows extras in the suffix in EXTRA, RF, SOL order", () => {
    const text = renderParadeState(
      coy(
        [subunit("PLATOON 1", [camp("A", present("A", 3))])],
        [
          duty("SOL", "PTE S", "A", "290926", "011026"),
          duty("EXTRA", "PTE E", "A", "300926", "300926"),
          duty("RF", "PTE R", "A", "300926", "300926"),
        ],
      ),
      EXAMPLE_CAA,
    );
    expect(text).toContain("• Present Strength: 03 + 01 EXTRA + 01 RF + 01 SOL\n");
    expect(text).toContain("Serving Extra: 01\n\n1. PTE E\n\nRF: 01\n\n1. PTE R\n\nServing SOL: 01\n\n1. PTE S (290926 - 011026)\n\n");
    expect(text).toContain("PLATOON 1: 06/03");
  });

  it("PARITY QUIRK: extras on an off-shift camp still count towards the platoon", () => {
    const text = renderParadeState(
      coy([subunit("PLATOON 1", [camp("A", present("A", 2), false)])], [duty("RF", "PTE R", "A", "300926", "300926")]),
      EXAMPLE_CAA,
    );
    expect(text).toContain("• Present strength: 1\n");
    expect(text).toContain("• Present Strength: 00\n• Off Shift: 02\n");
    expect(text).not.toContain("RF: 01");
  });

  it("HQ does not count extras but still lists them", () => {
    const text = renderParadeState(
      coy([subunit("COY HQ", [camp("COY HQ", present("HQ", 2))], true)], [duty("RF", "PTE R", "COY HQ", "300926", "300926")]),
      EXAMPLE_CAA,
    );
    expect(text).toContain("COY HQ: 02/02");
    expect(text).toContain("COY HQ\n• Total Strength: 02\n• Present Strength: 02\n\nRF: 01\n\n1. PTE R\n\n• Absentees (MC, AL, etc): 00\n");
  });
});
