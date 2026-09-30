// Strength counting — port of count_strength_camp / count_strength_platoon
// (legacy/paradestate.py:579-652). Pure; assumes validate() came back clean.

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

export function dutiesByCamp(duties: SnapshotDuty[]): Map<string, Record<DutyType, SnapshotDuty[]>> {
  const map = new Map<string, Record<DutyType, SnapshotDuty[]>>();
  for (const d of duties) {
    let entry = map.get(d.campId);
    if (!entry) {
      entry = { EXTRA: [], RF: [], SOL: [] };
      map.set(d.campId, entry);
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
    duties: duties ?? { EXTRA: [], RF: [], SOL: [] },
  };
}

export function computeCoy(snapshot: CoySnapshot): CoyState {
  const duties = dutiesByCamp(snapshot.duties);
  const subunits = snapshot.subunits.map((subunit): SubunitState => {
    const camps = subunit.camps.map((c) => computeCamp(c, duties.get(c.id)));
    let present = 0;
    for (const c of camps) {
      present += c.present;
      if (!subunit.isHq) {
        // PARITY QUIRK: the bot adds Extra/RF/SOL to the platoon's present count
        // even when their camp is off shift (where the camp itself shows 00).
        // HQ never adds them (the bot counts HQ via count_strength_camp only).
        present += c.duties.EXTRA.length + c.duties.RF.length + c.duties.SOL.length;
      }
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
