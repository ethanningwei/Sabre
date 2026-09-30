"use client";

import { AlertTriangle, Loader2, Plus, Search } from "lucide-react";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { endDuty, saveDuty } from "@/lib/actions/duties";
import { ddmmyy } from "@/lib/parade/time";
import { DUTY_TYPES, type DutyType, type SnapshotDuty } from "@/lib/parade/types";
import { cn } from "@/lib/utils";

interface CampOption {
  id: string;
  name: string;
  subunit: string;
  canEdit: boolean;
}
interface RosterOption {
  id: string;
  rank: string;
  name: string;
  camp: string;
}

const DUTY_LABEL: Record<DutyType, string> = { EXTRA: "Extra", RF: "RF", SOL: "SOL" };

const toInput = (hhmm: string | null) => (hhmm ? `${hhmm.slice(0, 2)}:${hhmm.slice(2)}` : "");
const fromInput = (v: string) => (v ? v.replace(":", "") : null);

export function DutiesView({
  duties,
  camps,
  roster,
  issues,
  today,
  openDutyId,
}: {
  duties: SnapshotDuty[];
  camps: CampOption[];
  roster: RosterOption[];
  issues: { dutyId: string; message: string }[];
  today: string;
  openDutyId: string | null;
}) {
  const [editing, setEditing] = useState<SnapshotDuty | "new" | null>(
    duties.find((d) => d.id === openDutyId) ?? null,
  );
  const editableCamps = camps.filter((c) => c.canEdit);
  const campById = new Map(camps.map((c) => [c.id, c]));
  const issuesByDuty = new Map<string, string[]>();
  for (const i of issues) issuesByDuty.set(i.dutyId, [...(issuesByDuty.get(i.dutyId) ?? []), i.message]);

  const grouped = camps
    .map((c) => ({ camp: c, list: duties.filter((d) => d.campId === c.id) }))
    .filter((g) => g.list.length);

  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-end justify-between px-1">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Extra / RF / SOL</h1>
          <p className="text-sm text-muted-foreground">People serving at a camp, added to its present strength</p>
        </div>
        {editableCamps.length > 0 && (
          <Button onClick={() => setEditing("new")}>
            <Plus /> Add
          </Button>
        )}
      </div>

      {grouped.length === 0 && (
        <div className="rounded-xl border border-dashed p-8 text-center text-sm text-muted-foreground">
          Nobody is serving Extra, RF or SOL right now.
        </div>
      )}

      {grouped.map(({ camp, list }) => (
        <section key={camp.id} className="flex flex-col gap-2">
          <h2 className="px-1 text-sm font-medium text-muted-foreground">
            {camp.subunit} › {camp.name}
          </h2>
          <ul className="flex flex-col divide-y rounded-xl border bg-card">
            {list.map((d) => {
              const problems = issuesByDuty.get(d.id) ?? [];
              return (
                <li key={d.id}>
                  <button
                    className="flex w-full items-center gap-3 px-3 py-3 text-left disabled:cursor-default"
                    onClick={() => setEditing(d)}
                    disabled={!camp.canEdit}
                  >
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[15px] font-medium">
                        <span className="text-muted-foreground">{d.rank}</span> {d.name}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {d.startDate ? ddmmyy(d.startDate) : "?"} – {d.endDate ? ddmmyy(d.endDate) : "?"}
                      </p>
                      {problems.map((m) => (
                        <p key={m} className="flex items-center gap-1 text-xs text-issue">
                          <AlertTriangle className="size-3" /> {m.replace(/^'[^']*' \([A-Z]+\): /, "")}
                        </p>
                      ))}
                    </div>
                    <span
                      className={cn(
                        "rounded-full px-2.5 py-0.5 text-xs font-semibold",
                        problems.length ? "bg-issue/12 text-issue" : "bg-duty/12 text-duty",
                      )}
                    >
                      {DUTY_LABEL[d.type]}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        </section>
      ))}

      <Sheet open={editing !== null} onOpenChange={(o) => !o && setEditing(null)}>
        <SheetContent side="bottom" className="mx-auto max-h-[92dvh] max-w-2xl gap-0 overflow-y-auto rounded-t-2xl">
          <div className="mx-auto mt-2 h-1.5 w-10 rounded-full bg-muted" />
          <SheetHeader className="pb-2">
            <SheetTitle className="text-lg">{editing === "new" ? "Add Extra / RF / SOL" : "Edit duty"}</SheetTitle>
            <SheetDescription>
              {editing && editing !== "new" ? `${campById.get(editing.campId)?.name ?? ""}` : "Pick who is serving and where"}
            </SheetDescription>
          </SheetHeader>
          {editing !== null && (
            <DutyForm
              key={editing === "new" ? "new" : editing.id}
              duty={editing === "new" ? null : editing}
              camps={editableCamps}
              roster={roster}
              today={today}
              onDone={() => setEditing(null)}
            />
          )}
        </SheetContent>
      </Sheet>
    </div>
  );
}

function DutyForm({
  duty,
  camps,
  roster,
  today,
  onDone,
}: {
  duty: SnapshotDuty | null;
  camps: CampOption[];
  roster: RosterOption[];
  today: string;
  onDone: () => void;
}) {
  const [type, setType] = useState<DutyType>(duty?.type ?? "RF");
  const [rank, setRank] = useState(duty?.rank ?? "");
  const [name, setName] = useState(duty?.name ?? "");
  const [personId, setPersonId] = useState<string | null>(null);
  const [campId, setCampId] = useState(duty?.campId ?? camps[0]?.id ?? "");
  const [startDate, setStartDate] = useState(duty?.startDate ?? today);
  const [startTime, setStartTime] = useState(toInput(duty?.startTime ?? null));
  const [endDate, setEndDate] = useState(duty?.endDate ?? today);
  const [endTime, setEndTime] = useState(toInput(duty?.endTime ?? null));
  const [search, setSearch] = useState("");
  const [pending, startTransition] = useTransition();

  const matches =
    search.trim().length >= 2
      ? roster.filter((p) => `${p.rank} ${p.name}`.toLowerCase().includes(search.trim().toLowerCase())).slice(0, 6)
      : [];

  function save() {
    startTransition(async () => {
      const res = await saveDuty({
        id: duty?.id,
        type,
        rank,
        name,
        personId,
        campId,
        startDate: startDate || null,
        startTime: fromInput(startTime),
        endDate: endDate || null,
        endTime: fromInput(endTime),
      });
      if (res.ok) {
        toast.success("Saved");
        onDone();
      } else toast.error(res.error);
    });
  }

  function end() {
    if (!duty) return;
    startTransition(async () => {
      const res = await endDuty(duty.id);
      if (res.ok) {
        toast.success(`${duty.rank} ${duty.name} removed`);
        onDone();
      } else toast.error(res.error);
    });
  }

  return (
    <div className="flex flex-col gap-5 px-4 pb-[calc(1rem+env(safe-area-inset-bottom))]">
      <div className="grid grid-cols-3 gap-2">
        {DUTY_TYPES.map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => setType(t)}
            className={cn(
              "h-12 rounded-xl border text-sm font-semibold transition-colors",
              type === t ? "border-duty bg-duty text-white" : "bg-background hover:bg-muted",
            )}
          >
            {DUTY_LABEL[t]}
          </button>
        ))}
      </div>

      {!duty && (
        <div className="flex flex-col gap-1.5">
          <Label className="text-xs text-muted-foreground">Find in roster (optional)</Label>
          <div className="relative">
            <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Type a name" className="h-11 pl-9" />
          </div>
          {matches.length > 0 && (
            <ul className="flex flex-col divide-y rounded-lg border">
              {matches.map((p) => (
                <li key={p.id}>
                  <button
                    type="button"
                    className="flex w-full items-center justify-between px-3 py-2 text-left text-sm hover:bg-muted"
                    onClick={() => {
                      setRank(p.rank);
                      setName(p.name);
                      setPersonId(p.id);
                      setSearch("");
                    }}
                  >
                    <span>
                      <span className="text-muted-foreground">{p.rank}</span> {p.name}
                    </span>
                    <span className="text-xs text-muted-foreground">{p.camp}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      <div className="grid grid-cols-[6rem_1fr] gap-3">
        <Field label="Rank">
          <Input value={rank} onChange={(e) => setRank(e.target.value.toUpperCase())} className="h-11" placeholder="CPL" />
        </Field>
        <Field label="Name">
          <Input
            value={name}
            onChange={(e) => {
              setName(e.target.value.toUpperCase());
              setPersonId(null);
            }}
            className="h-11"
            placeholder="TAN AH KOW"
          />
        </Field>
      </div>

      <Field label="Serving at camp">
        <select
          value={campId}
          onChange={(e) => setCampId(e.target.value)}
          className="h-11 rounded-lg border bg-background px-3 text-sm"
        >
          {camps.map((c) => (
            <option key={c.id} value={c.id}>
              {c.subunit} › {c.name}
            </option>
          ))}
        </select>
      </Field>

      <div className="grid grid-cols-2 gap-3">
        <Field label="Start date">
          <Input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} className="h-11" />
        </Field>
        <Field label="Start time (optional)">
          <Input type="time" value={startTime} onChange={(e) => setStartTime(e.target.value)} className="h-11" />
        </Field>
        <Field label="End date">
          <Input type="date" value={endDate} min={startDate} onChange={(e) => setEndDate(e.target.value)} className="h-11" />
        </Field>
        <Field label="End time (optional)">
          <Input type="time" value={endTime} onChange={(e) => setEndTime(e.target.value)} className="h-11" />
        </Field>
        {type === "SOL" && (
          <p className="col-span-2 -mt-1 text-xs text-muted-foreground">SOL prints its dates in the parade state.</p>
        )}
      </div>

      <div className="flex flex-col gap-2">
        <Button size="lg" className="h-12 text-base" onClick={save} disabled={pending}>
          {pending && <Loader2 className="animate-spin" />}
          Save
        </Button>
        {duty && (
          <Button size="lg" variant="destructive" className="h-12" onClick={end} disabled={pending}>
            Finished serving: remove
          </Button>
        )}
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5">
      <Label className="text-xs text-muted-foreground">{label}</Label>
      {children}
    </div>
  );
}
