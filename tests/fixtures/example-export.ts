import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { SheetExport } from "@/lib/data/parse-export";
import { ddmmyy, type SnapshotAbsence } from "@/lib/parade";
import { exampleSnapshot } from "./example-snapshot";

const golden = readFileSync(join(__dirname, "example-300926.txt"), "utf8");

const cell = (date: string | null, time: string | null) => (date ? ddmmyy(date) + (time ? ` ${time}` : "") : "");

/** What export_from_sheets.py would produce for the example sheets. */
export function exampleExport(): SheetExport {
  const snap = exampleSnapshot();
  const campName = new Map(snap.subunits.flatMap((s) => s.camps.map((c) => [c.id, c.name])));
  return {
    exportedAt: "2026-09-30T11:00:00+08:00",
    coy: { key: "SABRE", displayName: "Sabre", telegramChatId: "-100123", telegramThreadId: null },
    subunits: snap.subunits.map((s) => ({
      name: s.name,
      isHq: s.isHq,
      camps: s.camps.map((c) => ({
        name: c.name,
        onShift: c.onShift,
        people: c.people.map((p) => {
          const a: SnapshotAbsence | null = p.absence;
          return {
            name: p.name,
            rank: p.rank,
            role: "",
            attendance: a?.type ?? "PRESENT",
            start: a ? cell(a.startDate, a.startTime) : "",
            end: a ? cell(a.endDate, a.endTime) : "",
            maTiming: a?.maTiming ?? "",
            maLocation: a?.maLocation ?? "",
            otherReason: a?.otherReason ?? "",
          };
        }),
      })),
    })),
    duties: snap.duties.map((d) => ({
      type: d.type,
      camp: campName.get(d.campId)!,
      rank: d.rank,
      name: d.name,
      start: cell(d.startDate, d.startTime),
      end: cell(d.endDate, d.endTime),
    })),
    botText: golden,
    caaLine: "CAA: 300926 1100H",
  };
}

