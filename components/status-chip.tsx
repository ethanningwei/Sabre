import type { AbsenceType } from "@/lib/parade/types";
import { STATUS_LABEL } from "@/lib/status";
import { cn } from "@/lib/utils";

export function StatusChip({
  status,
  overdue,
  className,
}: {
  status: AbsenceType | "PRESENT" | "OFFSHIFT";
  overdue?: boolean;
  className?: string;
}) {
  const tone = overdue
    ? "bg-issue/12 text-issue ring-issue/25"
    : status === "PRESENT"
      ? "bg-present/12 text-present ring-present/25"
      : status === "OFFSHIFT"
        ? "bg-offshift/12 text-offshift ring-offshift/25"
        : "bg-absent/15 text-absent ring-absent/30";
  return (
    <span
      className={cn(
        "inline-flex h-6 shrink-0 items-center rounded-full px-2.5 text-xs font-semibold ring-1 ring-inset",
        tone,
        className,
      )}
    >
      {overdue ? "Overdue" : status === "OFFSHIFT" ? "Off shift" : STATUS_LABEL[status]}
    </span>
  );
}
