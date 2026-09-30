import { ChevronLeft } from "lucide-react";
import Link from "next/link";

export function AdminHeader({ title, description, children }: { title: string; description?: string; children?: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-3">
      <Link href="/admin" className="-ml-1 inline-flex w-fit items-center gap-0.5 text-sm text-muted-foreground hover:text-foreground">
        <ChevronLeft className="size-4" /> Admin
      </Link>
      <div className="flex items-end justify-between gap-3 px-1">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">{title}</h1>
          {description && <p className="text-sm text-muted-foreground">{description}</p>}
        </div>
        {children}
      </div>
    </div>
  );
}
