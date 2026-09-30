import type { AbsenceType, SnapshotAbsence } from "@/lib/parade/types";
import { ddmmyy } from "@/lib/parade/time";

export const STATUS_LABEL: Record<AbsenceType | "PRESENT", string> = {
  PRESENT: "Present",
  HL: "HL",
  MC: "MC",
  OL: "OL",
  AL: "AL",
  OFF: "Off",
  MA: "MA",
  OTHERS: "Others",
};

export const STATUS_HINT: Record<AbsenceType, string> = {
  HL: "Hospitalisation leave",
  MC: "Medical certificate",
  OL: "Overseas leave",
  AL: "Annual leave",
  OFF: "Off",
  MA: "Medical appointment",
  OTHERS: "Course, engagement, RSO…",
};

/** Short human summary of an absence, for chips and lists. */
export function absenceSummary(a: SnapshotAbsence): string {
  if (a.type === "MA") return `MA ${a.maTiming}H${a.maLocation ? ` @ ${a.maLocation}` : ""}`;
  const label = a.type === "OTHERS" ? a.otherReason.trim() || "Others" : a.type;
  if (a.startDate && a.endDate) {
    const s = ddmmyy(a.startDate) + (a.startTime ? ` ${a.startTime}` : "");
    const e = ddmmyy(a.endDate) + (a.endTime ? ` ${a.endTime}` : "");
    return `${label} · ${s} – ${e}`;
  }
  return label;
}
