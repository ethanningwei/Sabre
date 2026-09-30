import { AdminHeader } from "@/components/admin-header";
import { StructureEditor } from "@/components/admin/structure-editor";
import { requireAdminPage } from "@/lib/authz";
import { currentSnapshot } from "@/lib/data/current";

export default async function StructurePage() {
  const [, snapshot] = await Promise.all([requireAdminPage(), currentSnapshot()]);
  return (
    <div className="flex flex-col gap-5">
      <AdminHeader title="Structure" description="Order here is the order in the parade state." />
      <StructureEditor
        subunits={snapshot.subunits.map((s) => ({
          id: s.id,
          name: s.name,
          isHq: s.isHq,
          camps: s.camps.map((c) => ({ id: c.id, name: c.name, post: c.post, people: c.people.length })),
        }))}
      />
    </div>
  );
}
