import { DutiesView } from "@/components/duties-view";
import { canEditSubunit, requireViewer } from "@/lib/authz";
import { getCoy, loadSnapshot } from "@/lib/data/snapshot";
import { currentCaa, validate } from "@/lib/parade";

export default async function DutiesPage({ searchParams }: PageProps<"/duties">) {
  const { duty: openDutyId } = await searchParams;
  const viewer = await requireViewer();
  const snapshot = await loadSnapshot(await getCoy());
  const caa = currentCaa();

  const camps = snapshot.subunits.flatMap((s) =>
    s.camps.map((c) => ({
      id: c.id,
      name: c.name,
      subunit: s.name,
      canEdit: canEditSubunit(viewer, s.id),
    })),
  );
  const roster = snapshot.subunits.flatMap((s) =>
    s.camps.flatMap((c) => c.people.map((p) => ({ id: p.id, rank: p.rank, name: p.name, camp: c.name }))),
  );
  const dutyIssues = validate(snapshot, caa)
    .filter((i) => i.target.kind === "duty")
    .map((i) => ({ dutyId: i.target.kind === "duty" ? i.target.dutyId : "", message: i.message }));

  return (
    <DutiesView
      duties={snapshot.duties}
      camps={camps}
      roster={roster}
      issues={dutyIssues}
      today={caa.date}
      openDutyId={typeof openDutyId === "string" ? openDutyId : null}
    />
  );
}
