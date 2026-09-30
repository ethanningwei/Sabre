import { cn } from "@/lib/utils";

/** Simple sabre mark — swap for the unit crest when available. */
export function Logo({ className }: { className?: string }) {
  return (
    <div className={cn("grid place-items-center rounded-2xl bg-primary text-primary-foreground", className)}>
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" className="size-3/5">
        <path d="M5 19 17.5 6.5c1-1 1.5-2.3 1.5-3.5-1.2 0-2.5.5-3.5 1.5L3 17" />
        <path d="m3 21 2-2m-1-3 4 4" />
      </svg>
    </div>
  );
}
