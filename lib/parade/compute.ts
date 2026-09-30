// Strength counting — port of count_strength_camp / count_strength_platoon
// (legacy/paradestate.py:579-652), plus the Extra/RF/SOL rules that the Sheets
// left to people to apply by hand. Pure; assumes validate() came back clean.

import {
  ABSENCE_TYPES,
  type AbsenceType,
  type CoySnapshot,
  type DutyType,
  type SnapshotCamp,
  type SnapshotDuty,
  type SnapshotPerson,
  type SnapshotSubunit,
} from "./types";

export interface CampState {
  camp: SnapshotCamp;
  total: number;
  /** 0 when off shift */
  present: number;
  onShift: boolean;
  /** grouped by reason in bot order (HL, MC, OL, AL, OFF, MA, OTHERS), roster order within */
  absentees: SnapshotPerson[];
  /** Extra/RF/SOL counted at this camp — always empty for an off-shift camp */
  duties: Record<DutyType, SnapshotDuty[]>;
}

export interface SubunitState {
  subunit: SnapshotSubunit;
  total: number;
  present: number;
  camps: CampState[];
}

export interface CoyState {
  total: number;
  present: number;
  subunits: SubunitState[];
}

/**
 * Teams that take turns at one physical camp share a post: "SFT A" and
 * "SFT B" -> "SFT". A camp whose name has no sibling is its own post.
 */
export function derivePosts(names: string[]): Map<string, string> {
  const base = (n: string) => n.replace(/\s+[A-Z]$/, "");
  const counts = new Map<string, number>();
  for (const n of names) counts.set(base(n), (counts.get(base(n)) ?? 0) + 1);
  return new Map(names.map((n) => [n, (counts.get(base(n)) ?? 0) > 1 ? base(n) : n]));
}

export interface CampIndex {
  camps: Map<string, SnapshotCamp>;
  homeOf: Map<string, SnapshotCamp>;
}

export function indexCamps(snapshot: CoySnapshot): CampIndex {
  const camps = new Map<string, SnapshotCamp>();
  const homeOf = new Map<string, SnapshotCamp>();
  for (const s of snapshot.subunits) {
    for (const c of s.camps) {
      camps.set(c.id, c);
      for (const p of c.people) homeOf.set(p.id, c);
    }
  }
  return { camps, homeOf };
}

/**
 * Which camp a duty counts at right now, or null if it doesn't count.
 *
 * SOL (stoppage of leave) with a known person: while their own team is on
 * shift they're simply present there. When their team goes off shift they
 * stay in camp and count under the team of the same physical camp that is
 * on shift, as SOL.
 *
 * Everything else counts at its camp — but only while that camp is on shift.
 */
export function servingCampId(duty: SnapshotDuty, idx: CampIndex): string | null {
  if (duty.type === "SOL" && duty.personId) {
    const home = idx.homeOf.get(duty.personId);
    if (!home || home.onShift) return null;
    for (const c of idx.camps.values()) {
      if (c.id !== home.id && c.post === home.post && c.onShift) return c.id;
    }
    return null;
  }
  return idx.camps.get(duty.campId)?.onShift ? duty.campId : null;
}

export function dutiesByCamp(snapshot: CoySnapshot, idx = indexCamps(snapshot)) {
  const map = new Map<string, Record<DutyType, SnapshotDuty[]>>();
  for (const d of snapshot.duties) {
    const at = servingCampId(d, idx);
    if (!at) continue;
    let entry = map.get(at);
    if (!entry) {
      entry = { EXTRA: [], RF: [], SOL: [] };
      map.set(at, entry);
    }
    entry[d.type].push(d);
  }
  return map;
}

export function computeCamp(camp: SnapshotCamp, duties: Record<DutyType, SnapshotDuty[]> | undefined): CampState {
  const byReason = Object.fromEntries(ABSENCE_TYPES.map((t) => [t, [] as SnapshotPerson[]])) as Record<
    AbsenceType,
    SnapshotPerson[]
  >;
  for (const p of camp.people) {
    if (p.absence) byReason[p.absence.type].push(p);
  }
  const absentees = ABSENCE_TYPES.flatMap((t) => byReason[t]);
  const total = camp.people.length;
  return {
    camp,
    total,
    present: camp.onShift ? total - absentees.length : 0,
    onShift: camp.onShift,
    absentees,
    duties: (camp.onShift && duties) || { EXTRA: [], RF: [], SOL: [] },
  };
}

export function computeCoy(snapshot: CoySnapshot): CoyState {
  const duties = dutiesByCamp(snapshot);
  const subunits = snapshot.subunits.map((subunit): SubunitState => {
    const camps = subunit.camps.map((c) => computeCamp(c, duties.get(c.id)));
    let present = 0;
    for (const c of camps) {
      present += c.present;
      // Extra/RF/SOL add to the platoon (never an off-shift camp: those have
      // none — the bot counted them there, which double-counted SOL).
      // HQ never adds them (the bot counts HQ via count_strength_camp only).
      if (!subunit.isHq) present += c.duties.EXTRA.length + c.duties.RF.length + c.duties.SOL.length;
    }
    return {
      subunit,
      total: camps.reduce((n, c) => n + c.total, 0),
      present,
      camps,
    };
  });
  return {
    total: subunits.reduce((n, s) => n + s.total, 0),
    present: subunits.reduce((n, s) => n + s.present, 0),
    subunits,
  };
}
