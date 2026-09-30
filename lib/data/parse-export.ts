// Turns the raw sheet cells from scripts/export_from_sheets.py into engine
// data, strictly: every cell that can't be represented is reported (all at
// once, like the bot) instead of guessed at.

import { parseDdmmyy, parseHhmm } from "@/lib/parade/time";
import { ABSENCE_TYPES, DUTY_TYPES, type AbsenceType, type DutyType, type SnapshotAbsence } from "@/lib/parade/types";
import type { CoyInput } from "./write-coy";

export interface RawPerson {
  name: string;
  rank: string;
  role: string;
  attendance: string;
  start: string;
  end: string;
  maTiming: string;
  maLocation: string;
  otherReason: string;
}

export interface SheetExport {
  exportedAt: string;
  coy: { key: string; displayName: string; telegramChatId: string | null; telegramThreadId: string | null };
  subunits: { name: string; isHq: boolean; camps: { name: string; onShift: boolean; people: RawPerson[] }[] }[];
  duties: { type: string; camp: string; rank: string; name: string; start: string; end: string }[];
  botText: string;
  /** "CAA: ddmmyy HHMMH" */
  caaLine: string;
}

/** 'ddmmyy' or 'ddmmyy hhmm' -> date + time. Accepts a trailing H on the time. */
export function parseDateTime(raw: string): { date: string | null; time: string | null } | string {
  const tokens = raw.trim().split(/\s+/).filter(Boolean);
  if (tokens.length === 0) return { date: null, time: null };
  if (tokens.length > 2) return `'${raw}' has too many parts — use ddmmyy or ddmmyy hhmm`;
  const date = parseDdmmyy(tokens[0]);
  if (!date) return `'${raw}': '${tokens[0]}' isn't a ddmmyy date`;
  if (tokens.length === 1) return { date, time: null };
  const time = parseHhmm(tokens[1].replace(/H$/i, ""));
  if (!time) return `'${raw}': '${tokens[1]}' isn't an hhmm time`;
  return { date, time };
}

export function parseCaaLine(line: string): { date: string; time: string } | null {
  const m = /^CAA: (\d{6}) (\d{4})H$/.exec(line.trim());
  const date = m && parseDdmmyy(m[1]);
  return m && date ? { date, time: m[2] } : null;
}

export function parseExport(data: SheetExport): { input: CoyInput; problems: string[] } {
  const problems: string[] = [];
  let seq = 0;

  const input: CoyInput = {
    coy: { id: "", key: data.coy.key, displayName: data.coy.displayName },
    telegram: { chatId: data.coy.telegramChatId, threadId: data.coy.telegramThreadId },
    subunits: data.subunits.map((s) => ({
      id: s.name,
      name: s.name,
      isHq: s.isHq,
      camps: s.camps.map((c) => ({
        id: c.name,
        name: c.name,
        onShift: c.onShift,
        people: c.people.map((p) => {
          const where = `${s.name} › ${c.name} › '${p.name}'`;
          let absence: SnapshotAbsence | null = null;
          const status = p.attendance.trim();
          if (status !== "PRESENT") {
            if (!ABSENCE_TYPES.includes(status as AbsenceType)) {
              problems.push(`${where}: unknown ATTENDANCE '${p.attendance}'`);
            } else {
              const start = parseDateTime(p.start);
              const end = parseDateTime(p.end);
              if (typeof start === "string") problems.push(`${where}: START DATE TIME ${start}`);
              if (typeof end === "string") problems.push(`${where}: END DATE TIME ${end}`);
              const s0 = typeof start === "string" ? { date: null, time: null } : start;
              const e0 = typeof end === "string" ? { date: null, time: null } : end;
              absence = {
                id: `a${++seq}`,
                type: status as AbsenceType,
                // verbatim, so the output matches the bot exactly
                otherReason: p.otherReason,
                startDate: s0.date,
                startTime: s0.time,
                endDate: e0.date,
                endTime: e0.time,
                maTiming: p.maTiming,
                maLocation: p.maLocation,
              };
            }
          }
          return { id: `p${++seq}`, name: p.name, rank: p.rank, role: p.role, absence };
        }),
      })),
    })),
    duties: data.duties.flatMap((d) => {
      const where = `EXTRA/RF/SOL › '${d.name}'`;
      if (!DUTY_TYPES.includes(d.type as DutyType)) return [];
      const start = parseDateTime(d.start);
      const end = parseDateTime(d.end);
      if (typeof start === "string") problems.push(`${where}: START DATE TIME ${start}`);
      if (typeof end === "string") problems.push(`${where}: END DATE TIME ${end}`);
      if (typeof start === "string" || typeof end === "string") return [];
      return [
        {
          id: `d${++seq}`,
          type: d.type as DutyType,
          rank: d.rank,
          name: d.name,
          campId: d.camp, // resolved by name in writeCoy
          startDate: start.date,
          startTime: start.time,
          endDate: end.date,
          endTime: end.time,
        },
      ];
    }),
  };
  return { input, problems };
}
