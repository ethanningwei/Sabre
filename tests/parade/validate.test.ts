import { describe, expect, it } from "vitest";
import { validate } from "@/lib/parade";
import type { CoySnapshot } from "@/lib/parade/types";
import { EXAMPLE_CAA, absent, camp, duty, exampleSnapshot, present, subunit } from "../fixtures/example-snapshot";

function coy(subunits: CoySnapshot["subunits"], duties: CoySnapshot["duties"] = []): CoySnapshot {
  return { coy: { id: "c", key: "T", displayName: "Test" }, subunits, duties };
}
const codes = (s: CoySnapshot, caa = EXAMPLE_CAA) => validate(s, caa).map((i) => i.code);

describe("validate", () => {
  it("passes the real example", () => {
    expect(validate(exampleSnapshot(), EXAMPLE_CAA)).toEqual([]);
  });

  it("flags missing RANK even for someone present", () => {
    const p = present("A", 1);
    p[0].rank = " ";
    expect(codes(coy([subunit("P1", [camp("A", p)])]))).toEqual(["missing-rank"]);
  });

  it("flags dated absences without both dates, but not MA or OTHERS", () => {
    const s = coy([
      subunit("P1", [
        camp("A", [
          absent("PTE A", { type: "MC", start: "290926" }),
          absent("PTE B", { type: "OTHERS", reason: "RSO" }),
          absent("PTE C", { type: "MA", maTiming: "1300" }),
        ]),
      ]),
    ]);
    expect(codes(s)).toEqual(["missing-dates"]);
  });

  it("flags MA without timing and OTHERS without reason", () => {
    const s = coy([
      subunit("P1", [camp("A", [absent("PTE A", { type: "MA" }), absent("PTE B", { type: "OTHERS", reason: " " })])]),
    ]);
    expect(codes(s)).toEqual(["missing-ma-timing", "missing-other-reason"]);
  });

  it("treats a date-only end as lasting the whole day", () => {
    const s = coy([subunit("P1", [camp("A", [absent("PTE A", { type: "MC", start: "290926", end: "300926" })])])]);
    expect(codes(s, { date: "2026-09-30", time: "2300" })).toEqual([]);
    expect(codes(s, { date: "2026-10-01", time: "0000" })).toEqual(["overdue-absence"]);
  });

  it("uses the end time when there is one", () => {
    const s = coy([
      subunit("P1", [camp("A", [absent("PTE A", { type: "MC", start: "290926 2100", end: "300926 0900" })])]),
    ]);
    expect(codes(s, { date: "2026-09-30", time: "0900" })).toEqual([]);
    expect(codes(s, { date: "2026-09-30", time: "1000" })).toEqual(["overdue-absence"]);
  });

  it("flags an MA from a previous day", () => {
    const s = coy([
      subunit("P1", [camp("A", [absent("PTE A", { type: "MA", maTiming: "1300", start: "290926" })])]),
    ]);
    expect(codes(s)).toEqual(["overdue-absence"]);
  });

  it("flags overdue duties", () => {
    const s = coy([subunit("P1", [camp("A", present("A", 1))])], [duty("RF", "CPL R", "A", "280926", "290926")]);
    expect(codes(s)).toEqual(["overdue-duty"]);
  });

  it("flags HQ without exactly one camp, and empty camps", () => {
    const s = coy([
      subunit("COY HQ", [camp("COY HQ", present("H", 1)), camp("EXTRA HQ", present("E", 1))], true),
      subunit("P1", [camp("A", [])]),
    ]);
    expect(codes(s)).toEqual(["hq-camp-count", "empty-camp"]);
  });

  it("reports every problem in one pass, with scope and a fix target", () => {
    const snap = exampleSnapshot();
    const p5 = snap.subunits[1];
    const sftB = p5.camps[1];
    sftB.people[0].rank = "";
    const hdn = p5.camps[3];
    hdn.people[0].absence = { ...hdn.people[0].absence!, endDate: "2026-09-29" };
    const slr = snap.subunits[2].camps[0];
    slr.people[1].absence = { ...slr.people[1].absence!, startDate: null };

    const issues = validate(snap, EXAMPLE_CAA);
    expect(issues.map((i) => [i.code, i.scope.join(" › ")])).toEqual([
      ["missing-rank", "PLATOON 5 › SFT B"],
      ["overdue-absence", "PLATOON 5 › HDN"],
      ["missing-dates", "PLATOON 6 › SLR"],
    ]);
    expect(issues[0].target).toEqual({ kind: "person", campId: sftB.id, personId: sftB.people[0].id });
  });
});
