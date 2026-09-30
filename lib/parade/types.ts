// Plain data the parade-state engine works on. No DB or I/O types leak in here,
// so the engine can be tested exactly and the UI can be built on fixtures.
//
// Dates are 'YYYY-MM-DD' strings and times are 'HHMM' strings, both in
// Singapore time. Singapore has no DST, so string comparison is exact.

export const ABSENCE_TYPES = ["HL", "MC", "OL", "AL", "OFF", "MA", "OTHERS"] as const;
export type AbsenceType = (typeof ABSENCE_TYPES)[number];

// These must carry both START and END dates. MA is exempt (one day, with a
// timing), and so is OTHERS, as in the bot: some have no end date yet.
export const DATED_ABSENCE_TYPES: readonly AbsenceType[] = ["HL", "MC", "OL", "AL", "OFF"];

export const DUTY_TYPES = ["EXTRA", "RF", "SOL"] as const;
export type DutyType = (typeof DUTY_TYPES)[number];

export interface SnapshotAbsence {
  id: string;
  type: AbsenceType;
  otherReason: string;
  startDate: string | null;
  startTime: string | null;
  endDate: string | null;
  endTime: string | null;
  maTiming: string;
  maLocation: string;
}

export interface SnapshotPerson {
  id: string;
  name: string;
  rank: string;
  role: string;
  /** null = PRESENT */
  absence: SnapshotAbsence | null;
}

export interface SnapshotCamp {
  id: string;
  name: string;
  /**
   * The physical camp this team belongs to. Teams of one physical camp
   * (e.g. "SFT A" and "SFT B", post "SFT") take turns on shift.
   */
  post: string;
  onShift: boolean;
  /** roster order */
  people: SnapshotPerson[];
}

export interface SnapshotSubunit {
  id: string;
  name: string;
  isHq: boolean;
  /** display order */
  camps: SnapshotCamp[];
}

export interface SnapshotDuty {
  id: string;
  type: DutyType;
  rank: string;
  name: string;
  /** the roster person serving it, if they're in this coy */
  personId: string | null;
  /**
   * EXTRA/RF: the camp they serve at.
   * SOL with a personId: their HOME camp — where it counts is worked out from
   * the shifts (see servingCampId). SOL without a personId: fixed camp (legacy import).
   */
  campId: string;
  startDate: string | null;
  startTime: string | null;
  endDate: string | null;
  endTime: string | null;
}

export interface CoySnapshot {
  coy: { id: string; key: string; displayName: string };
  /** display order */
  subunits: SnapshotSubunit[];
  /** display order within each camp */
  duties: SnapshotDuty[];
}

/** Where the UI should send someone to fix an issue. */
export type IssueTarget =
  | { kind: "person"; campId: string; personId: string }
  | { kind: "camp"; campId: string }
  | { kind: "subunit"; subunitId: string }
  | { kind: "duty"; dutyId: string };

export type IssueCode =
  | "missing-rank"
  | "missing-dates"
  | "missing-ma-timing"
  | "missing-other-reason"
  | "overdue-absence"
  | "overdue-duty"
  | "duty-missing-dates"
  | "double-counted"
  | "hq-camp-count"
  | "empty-camp";

export interface Issue {
  code: IssueCode;
  /** e.g. ["PLATOON 5", "SFT B"] */
  scope: string[];
  message: string;
  target: IssueTarget;
}
