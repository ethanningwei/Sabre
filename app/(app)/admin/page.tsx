import { count, eq } from "drizzle-orm";
import { Building2, ChevronRight, MessageSquare, UserCog, Users } from "lucide-react";
import Link from "next/link";
import { requireAdminPage } from "@/lib/authz";
import { db } from "@/lib/db";
import { user } from "@/lib/db/schema";

export default async function AdminPage() {
  await requireAdminPage();
  const [{ pending }] = await db.select({ pending: count() }).from(user).where(eq(user.role, "pending"));

  const items = [
    { href: "/admin/users", icon: UserCog, title: "Users", desc: "Approve sign-ins, set roles and platoons", badge: pending },
    { href: "/admin/people", icon: Users, title: "People", desc: "Add, edit, move or remove people on the roster" },
    { href: "/admin/structure", icon: Building2, title: "Structure", desc: "Subunits and camps, their names and order" },
    { href: "/admin/settings", icon: MessageSquare, title: "Coy settings", desc: "Display name and the Telegram chat" },
  ];

  return (
    <div className="flex flex-col gap-5">
      <div className="px-1">
        <h1 className="text-xl font-semibold tracking-tight">Admin</h1>
      </div>
      <ul className="flex flex-col divide-y rounded-xl border bg-card">
        {items.map(({ href, icon: Icon, title, desc, badge }) => (
          <li key={href}>
            <Link href={href} className="flex items-center gap-3 px-4 py-4 hover:bg-muted/50">
              <div className="grid size-9 place-items-center rounded-lg bg-primary/10 text-primary">
                <Icon className="size-5" />
              </div>
              <div className="flex-1">
                <p className="font-medium">{title}</p>
                <p className="text-sm text-muted-foreground">{desc}</p>
              </div>
              {badge ? (
                <span className="rounded-full bg-issue px-2 py-0.5 text-xs font-semibold text-white">{badge}</span>
              ) : null}
              <ChevronRight className="size-4 text-muted-foreground" />
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
