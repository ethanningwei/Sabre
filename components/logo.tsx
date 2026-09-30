import { cn } from "@/lib/utils";

/** Corinthian (hoplite) helmet in profile. Shared with app/icon.svg. */
export function HelmetMark({ className }: { className?: string }) {
  return (
    <svg viewBox="1.6 0 24 24" aria-hidden className={className}>
      <path
        fill="currentColor"
        d="M5 9C5 4.4 8.9 1.5 13.6 1.5C18.4 1.5 22 4.8 22.8 10C21.5 9 20 8.2 18.4 7.9C16.8 6 14.5 5.1 12 5.2C9.1 5.3 6.7 6.8 5 9Z"
      />
      <path fill="currentColor" d="M11.3 5.1H12.9V7.6H11.3Z" />
      <path
        fill="currentColor"
        fillRule="evenodd"
        d="M4.5 17.6L4.8 12.4C5 8.8 8.3 6.8 12.2 6.8C16.2 6.8 18.7 9.3 18.7 12.9C18.7 15.7 19.1 18.4 20.7 20.8L14.9 20.4C14.5 19 13.4 18.2 12.2 18.3C11.6 19.8 11.8 21.2 11.4 22.3H7.1C6.7 20.4 7 18.8 7.6 17.4L8.5 16.4L5.9 17.6ZM6 13.8C7 12.8 8.9 12.7 10.2 13.6C9 14.6 7.1 14.6 6 13.8Z"
      />
    </svg>
  );
}

export function Logo({ className }: { className?: string }) {
  return (
    <div className={cn("grid place-items-center rounded-2xl bg-primary text-primary-foreground", className)}>
      <HelmetMark className="size-[68%]" />
    </div>
  );
}
