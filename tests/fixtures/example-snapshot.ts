// Snapshot reconstructed from the real Sabre parade state of 300926 1100H
// (tests/fixtures/example-300926.txt). Present people get placeholder names.

import type {
  AbsenceType,
  CoySnapshot,
  DutyType,
  SnapshotAbsence,
  SnapshotCamp,
  SnapshotDuty,
  SnapshotPerson,
  SnapshotSubunit,
} from "@/lib/parade/types";

let seq = 0;
const id = (p: string) => `${p}${++seq}`;

/** ddmmyy -> YYYY-MM-DD */
const iso = (s: string) => `20${s.slice(4, 6)}-${s.slice(2, 4)}-${s.slice(0, 2)}`;

type AbsenceSpec = {
  type: AbsenceType;
  reason?: string;
  start?: string; // 'ddmmyy' or 'ddmmyy hhmm'
  end?: string;
  maTiming?: string;
  maLocation?: string;
};

function absence(spec: AbsenceSpec): SnapshotAbsence {
  const [sd, st] = (spec.start ?? "").split(" ");
  const [ed, et] = (spec.end ?? "").split(" ");
  return {
    id: id("a"),
    type: spec.type,
    otherReason: spec.reason ?? "",
    startDate: sd ? iso(sd) : null,
    startTime: st ?? null,
    endDate: ed ? iso(ed) : null,
    endTime: et ?? null,
    maTiming: spec.maTiming ?? "",
    maLocation: spec.maLocation ?? "",
  };
}

export function absent(rankName: string, spec: AbsenceSpec): SnapshotPerson {
  const [rank, ...rest] = rankName.split(" ");
  return { id: id("p"), rank, name: rest.join(" "), role: "", absence: absence(spec) };
}

export function present(prefix: string, n: number): SnapshotPerson[] {
  return Array.from({ length: n }, (_, i) => ({
    id: id("p"),
    rank: "PTE",
    name: `${prefix} PRESENT ${i + 1}`,
    role: "",
    absence: null,
  }));
}

export function camp(name: string, people: SnapshotPerson[], onShift = true): SnapshotCamp {
  // teams of one physical camp: "SFT A"/"SFT B" -> "SFT"
  return { id: `camp:${name}`, name, post: name.replace(/\s+[AB]$/, ""), onShift, people };
}

export function subunit(name: string, camps: SnapshotCamp[], isHq = false): SnapshotSubunit {
  return { id: `sub:${name}`, name, isHq, camps };
}

export function duty(type: DutyType, rankName: string, campName: string, start: string, end: string): SnapshotDuty {
  const [rank, ...rest] = rankName.split(" ");
  return {
    id: id("d"),
    type,
    rank,
    name: rest.join(" "),
    personId: null,
    campId: `camp:${campName}`,
    startDate: iso(start),
    startTime: null,
    endDate: iso(end),
    endTime: null,
  };
}

const CLEMENTI = "Clementi CO/RSM/OC Engagement";
const O = (reason: string, start?: string, end?: string): AbsenceSpec => ({ type: "OTHERS", reason, start, end });

export function exampleSnapshot(): CoySnapshot {
  seq = 0;
  return {
    coy: { id: "coy:SABRE", key: "SABRE", displayName: "Sabre" },
    subunits: [
      subunit(
        "COY HQ",
        [
          camp("COY HQ", [
            ...present("HQ", 6),
            absent("3SG RUI HENG", { type: "OL", start: "250926", end: "041026" }),
            ...present("HQ2", 6),
            absent("LTA NICHOLAS", O("RF BDK (300926 - 300926)")),
            absent("3SG ETHAN TEO", O("RF BDK (280926 - 300926)")),
          ]),
        ],
        true,
      ),
      subunit("PLATOON 5", [
        camp("SFT A", present("SFTA", 22), false),
        camp("SFT B", [
          ...present("SFTB", 15),
          absent("LCP PARTHIV", O("MP60 ")),
          absent("PTE ABU BAKAR", O("MP60")),
          absent("PTE SHAN", O("RE-BMT")),
          absent("LCP JONATHAN", O("CBT COURSE", "140926", "061126")),
          absent("PTE MIKHAIL", O("CBT COURSE", "140926", "061126")),
          absent("CPL LUKE", O("RSO")),
          absent("PTE DHIMAN", O("RSO")),
        ]),
        camp("TFT", present("TFT", 4)),
        camp("HDN", [
          absent("LCP ZHARFAN", O("MP60 REHEARSALS @ MOWBRAY CAMP", "280926", "300926")),
          ...present("HDN", 10),
          absent("LCP SEKAR NAVEEN", O("MP60 REHEARSALS @ MOWBRAY CAMP", "280926", "300926")),
          absent("CPL DARRSHUN", { type: "HL", start: "290926", end: "051026" }),
          absent("PTE KAI ZENG", O("ENGAGEMENT @CLEMENTI CAMP")),
        ]),
      ]),
      subunit("PLATOON 6", [
        camp("SLR", [
          absent("PTE IRFAN", O(CLEMENTI)),
          absent("PTE WEI HAO", { type: "MC", start: "290926", end: "300926" }),
          absent("PTE JOSHUA LAU", O(CLEMENTI)),
          absent("LCP CHUN HEI", { type: "MC", start: "290926", end: "300926" }),
          absent("PTE XIAO HENG", O(CLEMENTI)),
          ...present("SLR", 12),
        ]),
        camp("SRF A", [...present("SRFA", 15), absent("LCP JOE NAVEEN", O("MP60 @ MOWBRAY CAMP", "280926", "300926"))]),
        camp("SRF B", [...present("SRFB", 15), absent("LCP XU CHENXI", O("MP60 @ MOWBRAY CAMP", "280926", "300926"))]),
      ]),
      subunit("PLATOON 7", [
        camp("BDK", [
          ...present("BDK", 11),
          absent("3SG HAKIMI", O("CL", "280926", "300926")),
          absent("LCP JACOB", O("CREATE M365 ACCOUNT @ CLEMENTI")),
          absent("LCP PHONE", O("MP60 REHEARSALS ", "230926", "300926")),
          absent("LCP RYAN", O("RETURN NO1 @ MOWBRAY")),
          absent("PTE LUO YU", O(CLEMENTI)),
          absent("LCP ANTHONY", O("XWB", "010926", "300926")),
          absent("PTE HARSHIT", O(CLEMENTI)),
        ]),
        camp("OSU A", present("OSUA", 10), false),
        camp("OSU B", [
          ...present("OSUB", 10),
          absent("LCP DHANESH", { type: "MC", start: "290926 2100", end: "011026 2100" }),
        ]),
      ]),
      subunit("PLATOON 8", [
        camp("PYAD A", present("PYADA", 15), false),
        camp("PYAD B", [
          absent("PTE RANDOLPH", O("CBT COURSE", "140926", "061126")),
          absent("LCP HAIRUL", { type: "MC", start: "200926 2100", end: "051026 2100" }),
          absent("LCP LOGESH", { type: "OFF", start: "280926 2100", end: "011026 2100" }),
          absent("LCP AMIR", { type: "MC", start: "280926 2100", end: "300926 2100" }),
          absent("PTE ZHENG LIANG", { type: "AL", start: "300926 0900", end: "011026 2100" }),
          absent("PTE KHAIRULLAH", O("CBT COURSE", "140926", "061126")),
          ...present("PYADB", 9),
        ]),
        camp("PRC", [
          ...present("PRC", 13),
          absent("PTE SANJIIVAN", O("SCC@CMPBH MA @ 1100")),
          absent("LCP FAIZ", O("MP60 TRAINING @ MOWBRAY CAMP", "230926", "300926")),
          absent("PTE SHEN JIE", O("DB", "130826", "090227")),
          absent("PTE JINGYI", O(CLEMENTI)),
          absent("PTE WAYNE FOONG", O(CLEMENTI)),
          absent("PTE JOSHUA SOO", O(CLEMENTI)),
        ]),
      ]),
    ],
    duties: [
      duty("SOL", "PTE HAOYANG", "SFT B", "250926", "081026"),
      duty("RF", "CPL TAUFIQ", "HDN", "300926", "300926"),
      duty("RF", "3SG ETHAN", "BDK", "280926", "300926"),
      duty("RF", "LTA NICHOLAS", "BDK", "300926", "300926"),
      duty("RF", "3SG DAVID", "PYAD B", "300926", "300926"),
    ],
  };
}

export const EXAMPLE_CAA = { date: "2026-09-30", time: "1100" };

