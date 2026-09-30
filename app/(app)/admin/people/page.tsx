import { AdminHeader } from "@/components/admin-header";
import { PeopleEditor } from "@/components/admin/people-editor";
import { requireAdminPage } from "@/lib/authz";
import { getCoy, loadSnapshot } from "@/lib/data/snapshot";

export default async function PeoplePage() {
  await requireAdminPage();
  const snapshot = await loadSnapshot(await getCoy());
  const camps = snapshot.subunits.flatMap((s) => s.camps.map((c) => ({ id: c.id, name: c.name, subunit: s.name })));
  const people = snapshot.subunits.flatMap((s) =>
    s.camps.flatMap((c) => c.people.map((p) => ({ id: p.id, rank: p.rank, name: p.name, role: p.role, campId: c.id }))),
  );
  return (
    <div className="flex flex-col gap-5">
      <AdminHeader title="People" description={`${people.length} on the roster`} />
      <PeopleEditor camps={camps} people={people} />
    </div>
  );
}
