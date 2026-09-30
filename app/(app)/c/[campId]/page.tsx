import { ChevronLeft } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { CampRoster } from "@/components/camp-roster";
import { canEditSubunit, requireViewer } from "@/lib/authz";
import { getReasonSuggestions } from "@/lib/data/reasons";
import { getCoy, loadSnapshot } from "@/lib/data/snapshot";
import { computeCoy, currentCaa, validate } from "@/lib/parade";

export default async function CampPage({ params, searchParams }: PageProps<"/c/[campId]">) {
  const { campId } = await params;
  const { person } = await searchParams;
  const viewer = await requireViewer();
  const snapshot = await loadSnapshot(await getCoy());
  const caa = currentCaa();

  const sub = computeCoy(snapshot).subunits.find((s) => s.camps.some((c) => c.camp.id === campId));
  const campState = sub?.camps.find((c) => c.camp.id === campId);
  if (!sub || !campState) notFound();

  const issues = validate(snapshot, caa)
    .filter((i) => i.target.kind === "person" && i.target.campId === campId)
    .map((i) => ({ personId: i.target.kind === "person" ? i.target.personId : "", code: i.code, message: i.message }));

  const duties = [...campState.duties.EXTRA, ...campState.duties.RF, ...campState.duties.SOL];

  return (
    <div className="flex flex-col gap-4">
      <Link
        href={`/s/${sub.subunit.id}`}
        className="-ml-1 inline-flex w-fit items-center gap-0.5 text-sm text-muted-foreground hover:text-foreground"
      >
        <ChevronLeft className="size-4" />
        {sub.subunit.name}
      </Link>
      <CampRoster
        camp={{ id: campState.camp.id, name: campState.camp.name, onShift: campState.onShift }}
        present={campState.present}
        total={campState.total}
        people={campState.camp.people}
        issues={issues}
        duties={duties.map((d) => ({ id: d.id, type: d.type, rank: d.rank, name: d.name }))}
        canEdit={canEditSubunit(viewer, sub.subunit.id)}
        reasons={await getReasonSuggestions()}
        today={caa.date}
        openPersonId={typeof person === "string" ? person : null}
      />
    </div>
  );
}
