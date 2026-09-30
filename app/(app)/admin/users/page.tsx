import { asc, eq, sql } from "drizzle-orm";
import { AdminHeader } from "@/components/admin-header";
import { UsersList } from "@/components/admin/users-list";
import { requireAdminPage } from "@/lib/authz";
import { getCoy } from "@/lib/data/snapshot";
import { db } from "@/lib/db";
import { subunit, user } from "@/lib/db/schema";

export default async function UsersPage() {
  const viewer = await requireAdminPage();
  const coyRow = await getCoy();
  const [users, subunits] = await Promise.all([
    db
      .select({
        id: user.id,
        name: user.name,
        email: user.email,
        image: user.image,
        role: user.role,
        subunitId: user.subunitId,
        active: user.active,
        createdAt: user.createdAt,
      })
      .from(user)
      .orderBy(sql`case ${user.role} when 'pending' then 0 when 'admin' then 1 else 2 end`, asc(user.name)),
    db.select({ id: subunit.id, name: subunit.name }).from(subunit).where(eq(subunit.coyId, coyRow.id)).orderBy(asc(subunit.sortOrder)),
  ]);

  return (
    <div className="flex flex-col gap-5">
      <AdminHeader title="Users" description="Everyone who has signed in. New sign-ins wait here for approval." />
      <UsersList users={users.map((u) => ({ ...u, createdAt: u.createdAt.toISOString() }))} subunits={subunits} viewerId={viewer.id} />
    </div>
  );
}
