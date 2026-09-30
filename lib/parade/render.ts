// Parade-state text — port of print_camp_strength / print_platoon_strength /
// render_coy_parade_state (legacy/paradestate.py:656-871).
//
// The output must match the bot CHARACTER FOR CHARACTER (golden-tested), so
// the odd spacing below is deliberate: e.g. "Total strength" is lowercase at
// platoon level, the separator has a trailing space, and platoon totals are
// not zero-padded.

import { computeCoy, type CampState, type SubunitState } from "./compute";
import { ddmmyy, type SgtParts } from "./time";
import type { CoySnapshot, SnapshotAbsence, SnapshotPerson } from "./types";

export const SECTION_SEPARATOR = "———————————————";

export function pad0(n: number): string {
  return n >= 10 ? String(n) : `0${n}`;
}

const d = (date: string | null) => (date ? ddmmyy(date) : "");
const t = (time: string | null) => time ?? "";

function absenteeDetail(a: SnapshotAbsence): string {
  const sd = d(a.startDate);
  const st = t(a.startTime);
  const ed = d(a.endDate);
  const et = t(a.endTime);
  const full = sd !== "" && st !== "" && ed !== "" && et !== "";

  if (a.type === "MA") {
    return a.maLocation === "" ? `(${a.maTiming}H MA)` : `(${a.maTiming}H MA @ ${a.maLocation})`;
  }
  if (a.type === "OTHERS") {
    if (full) return `(${a.otherReason} ${sd} ${st}H - ${ed} ${et}H)`;
    if (sd !== "" && ed !== "") return `(${a.otherReason} ${sd} - ${ed})`;
    return `(${a.otherReason})`;
  }
  if (full) return `(${a.type} ${sd} ${st}H - ${ed} ${et}H)`;
  return `(${a.type} ${sd} - ${ed})`;
}

export function absenteeLine(index: number, p: SnapshotPerson): string {
  return `${index}. ${p.rank} ${p.name} ${absenteeDetail(p.absence!)}`;
}

function renderCamp(out: string[], c: CampState, hq: boolean, hqLabel: string) {
  const p = (s = "") => out.push(s + "\n");
  const { EXTRA: extra, RF: rf, SOL: sol } = c.duties;

  if (hq) p(hqLabel);
  p(`• Total Strength: ${pad0(c.total)}`);

  if (c.onShift && !hq) {
    let suffix = "";
    if (extra.length) suffix += ` + ${pad0(extra.length)} EXTRA`;
    if (rf.length) suffix += ` + ${pad0(rf.length)} RF`;
    if (sol.length) suffix += ` + ${pad0(sol.length)} SOL`;
    p(`• Present Strength: ${pad0(c.present)}${suffix}`);
    p(`• Off Shift: 00`);
    p();
  } else if (c.onShift && hq) {
    p(`• Present Strength: ${pad0(c.present)}`);
    p();
  } else {
    p(`• Present Strength: 00`);
    p(`• Off Shift: ${pad0(c.total)}`);
    return;
  }

  for (const [label, list] of [
    ["Serving Extra", extra],
    ["RF", rf],
    ["Serving SOL", sol],
  ] as const) {
    if (!list.length) continue;
    p(`${label}: ${pad0(list.length)}`);
    p();
    list.forEach((duty, i) => {
      if (label === "Serving SOL") {
        // SOL prints dates only; any time portion is dropped
        p(`${i + 1}. ${duty.rank} ${duty.name} (${d(duty.startDate)} - ${d(duty.endDate)})`);
      } else {
        p(`${i + 1}. ${duty.rank} ${duty.name}`);
      }
      p();
    });
  }

  p(`• Absentees (MC, AL, etc): ${pad0(c.absentees.length)}`);
  if (c.absentees.length) p();
  c.absentees.forEach((person, i) => {
    p(absenteeLine(i + 1, person));
    if (i + 1 < c.absentees.length) p();
  });
}

function renderPlatoon(out: string[], s: SubunitState) {
  const p = (x = "") => out.push(x + "\n");
  p(s.subunit.name);
  p(`• Total strength: ${s.total}`);
  p(`• Present strength: ${s.present}`);
  p();
  s.camps.forEach((c, i) => {
    p(c.camp.name);
    renderCamp(out, c, false, "");
    if (i + 1 < s.camps.length) p();
  });
}

/** Render the full parade state. Only call once validate() returned no issues. */
export function renderParadeState(snapshot: CoySnapshot, caa: SgtParts): string {
  const state = computeCoy(snapshot);
  const out: string[] = [];
  out.push(`${snapshot.coy.displayName} Parade State\n\n`);
  out.push(`CAA: ${ddmmyy(caa.date)} ${caa.time}H\n\n`);
  out.push(`Total Strength: ${pad0(state.present)}/${pad0(state.total)}\n`);
  for (const s of state.subunits) {
    out.push(`${s.subunit.name}: ${pad0(s.present)}/${pad0(s.total)}\n`);
  }
  for (const s of state.subunits) {
    out.push(`${SECTION_SEPARATOR} \n\n`);
    if (s.subunit.isHq) renderCamp(out, s.camps[0], true, s.subunit.name);
    else renderPlatoon(out, s);
  }
  return out.join("");
}
