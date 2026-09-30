import { describe, expect, it } from "vitest";
import { validate } from "@/lib/parade";
import type { CoySnapshot } from "@/lib/parade/types";
import { EXAMPLE_CAA, absent, camp, datedExampleSnapshot, duty, exampleSnapshot, present, subunit } from "../fixtures/example-snapshot";

function coy(subunits: CoySnapshot["subunits"], duties: CoySnapshot["duties"] = []): CoySnapshot {
  return { coy: { id: "c", key: "T", displayName: "Test" }, subunits, duties };
}
const codes = (s: CoySnapshot, caa = EXAMPLE_CAA) => validate(s, caa).map((i) => i.code);

describe("validate", () => {
  it("passes the real example once OTHERS have dates", () => {
    expect(validate(datedExampleSnapshot(), EXAMPLE_CAA)).toEqual([]);
  });

  it("requires dates on OTHERS (stricter than the bot): the raw example has 19 without", () => {
    const issues = validate(exampleSnapshot(), EXAMPLE_CAA);
    expect(issues).toHaveLength(19);
    expect(new Set(issues.map((i) => i.code))).toEqual(new Set(["missing-dates"]));
  });

  it("flags missing RANK even for someone present", () => {
    const p = present("A", 1);
    p[0].rank = " ";
    expect(codes(coy([subunit("P1", [camp("A", p)])]))).toEqual(["missing-rank"]);
  });

  it("flags absences without both dates, except MA", () => {
    const s = coy([
      subunit("P1", [
        camp("A", [
          absent("PTE A", { type: "MC", start: "290926" }),
          absent("PTE B", { type: "OTHERS", reason: "RSO" }),
          absent("PTE C", { type: "MA", maTiming: "1300" }),
        ]),
      ]),
    ]);
    expect(codes(s)).toEqual(["missing-dates", "missing-dates"]);
  });

  it("flags MA without timing and OTHERS without reason", () => {
    const s = coy([
      subunit("P1", [camp("A", [absent("PTE A", { type: "MA" }), absent("PTE B", { type: "OTHERS", reason: " ", start: "300926", end: "300926" })])]),
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

  it("ignores everything about an off-shift camp's people", () => {
    const p = [absent("PTE A", { type: "MC", start: "200926", end: "250926" }), ...present("A", 1)];
    p[1].rank = "";
    expect(codes(coy([subunit("P1", [camp("A", p, false)])]))).toEqual([]);
    expect(codes(coy([subunit("P1", [camp("A", p, true)])]))).toEqual(["overdue-absence", "missing-rank"]);
  });

  it("ignores Extra/RF/SOL that aren't counted right now", () => {
    const s = coy([subunit("P1", [camp("A", present("A", 1), false)])], [duty("RF", "CPL R", "A", "280926", "290926")]);
    expect(codes(s)).toEqual([]);
  });

  it("flags someone on RF who is still counted present at their on-shift home team", () => {
    const home = camp("HDN", present("H", 2));
    const bdk = camp("BDK", present("B", 2));
    const rf = { ...duty("RF", "CPL R", "BDK", "300926", "300926"), personId: home.people[0].id };
    expect(codes(coy([subunit("P1", [home, bdk])], [rf]))).toEqual(["double-counted"]);
    home.people[0].absence = absent("X", { type: "OTHERS", reason: "RF @ BDK", start: "300926", end: "300926" }).absence;
    expect(codes(coy([subunit("P1", [home, bdk])], [rf]))).toEqual([]);
    home.onShift = false; // home off shift: nothing to double count
    home.people[0].absence = null;
    expect(codes(coy([subunit("P1", [home, bdk])], [rf]))).toEqual([]);
  });

  it("flags HQ without exactly one camp, and empty camps", () => {
    const s = coy([
      subunit("COY HQ", [camp("COY HQ", present("H", 1)), camp("EXTRA HQ", present("E", 1))], true),
      subunit("P1", [camp("A", [])]),
    ]);
    expect(codes(s)).toEqual(["hq-camp-count", "empty-camp"]);
  });

  it("reports every problem in one pass, with scope and a fix target", () => {
    const snap = datedExampleSnapshot();
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
