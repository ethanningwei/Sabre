import { cn } from "@/lib/utils";

export function StrengthBar({ present, total, className }: { present: number; total: number; className?: string }) {
  const pct = total ? Math.min(100, (present / total) * 100) : 0;
  return (
    <div className={cn("h-1.5 overflow-hidden rounded-full bg-muted", className)}>
      <div className="h-full rounded-full bg-present transition-all" style={{ width: `${pct}%` }} />
    </div>
  );
}
