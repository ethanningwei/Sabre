import { desc, eq, isNotNull } from "drizzle-orm";
import { AlertTriangle, CheckCircle2, ChevronRight, Moon } from "lucide-react";
import Link from "next/link";
import { StrengthBar } from "@/components/strength-bar";
import { Card } from "@/components/ui/card";
import { requireViewer } from "@/lib/authz";
import { currentSnapshot } from "@/lib/data/current";
import { db } from "@/lib/db";
import { paradeState, user } from "@/lib/db/schema";
import { computeCoy, currentCaa, ddmmyy, validate } from "@/lib/parade";
import { formatSgt } from "@/lib/format";

export default async function OverviewPage() {
  const [viewer, snapshot, [lastSent]] = await Promise.all([
    requireViewer(),
    currentSnapshot(),
    db
      .select({ sentAt: paradeState.sentAt, caaDate: paradeState.caaDate, caaTime: paradeState.caaTime, by: user.name })
      .from(paradeState)
      .leftJoin(user, eq(user.id, paradeState.sentBy))
      .where(isNotNull(paradeState.sentAt))
      .orderBy(desc(paradeState.sentAt))
      .limit(1),
  ]);
  const caa = currentCaa();
  const state = computeCoy(snapshot);
  const issues = validate(snapshot, caa);

  const issuesBySubunit = new Map<string, number>();
  for (const i of issues) issuesBySubunit.set(i.scope[0], (issuesBySubunit.get(i.scope[0]) ?? 0) + 1);

  return (
    <div className="flex flex-col gap-5">
      <section className="rounded-2xl bg-primary p-5 text-primary-foreground shadow-sm">
        <p className="text-sm/none opacity-80">Present strength · CAA {ddmmyy(caa.date)} {caa.time}H</p>
        <p className="mt-3 font-mono text-5xl font-semibold tracking-tight tabular-nums">
          {state.present}
          <span className="text-2xl opacity-60"> / {state.total}</span>
        </p>
        <div className="mt-4 h-2 overflow-hidden rounded-full bg-primary-foreground/20">
          <div
            className="h-full rounded-full bg-primary-foreground transition-all"
            style={{ width: `${state.total ? Math.min(100, (state.present / state.total) * 100) : 0}%` }}
          />
        </div>
        <p className="mt-3 text-xs opacity-80">
          {lastSent?.sentAt
            ? `Last sent ${formatSgt(lastSent.sentAt)}${lastSent.by ? ` by ${lastSent.by}` : ""}`
            : "No parade state sent yet"}
        </p>
      </section>

      <Link
        href="/parade"
        className={
          issues.length
            ? "flex items-center gap-3 rounded-xl border border-issue/30 bg-issue/10 p-4 text-sm"
            : "flex items-center gap-3 rounded-xl border border-present/30 bg-present/10 p-4 text-sm"
        }
      >
        {issues.length ? (
          <AlertTriangle className="size-5 shrink-0 text-issue" />
        ) : (
          <CheckCircle2 className="size-5 shrink-0 text-present" />
        )}
        <div className="flex-1">
          <p className="font-medium">
            {issues.length ? `${issues.length} issue${issues.length > 1 ? "s" : ""} to fix` : "Ready to generate"}
          </p>
          <p className="text-muted-foreground">
            {issues.length ? "The parade state is blocked until these are fixed." : "Everything checks out."}
          </p>
        </div>
        <ChevronRight className="size-4 text-muted-foreground" />
      </Link>

      <section className="flex flex-col gap-3">
        <h2 className="px-1 text-sm font-medium text-muted-foreground">Subunits</h2>
        {state.subunits.map((s) => {
          const absent = s.camps.reduce((n, c) => n + c.absentees.length, 0);
          const offCamps = s.camps.filter((c) => !c.onShift).length;
          const dutyCount = s.subunit.isHq
            ? 0
            : s.camps.reduce((n, c) => n + c.duties.EXTRA.length + c.duties.RF.length + c.duties.SOL.length, 0);
          const subIssues = issuesBySubunit.get(s.subunit.name) ?? 0;
          const mine = viewer.role === "guardcomm" && viewer.subunitId === s.subunit.id;
          return (
            <Link key={s.subunit.id} href={`/s/${s.subunit.id}`}>
              <Card className="gap-3 px-4 transition-colors hover:bg-muted/50">
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2">
                    <span className="font-medium">{s.subunit.name}</span>
                    {mine && <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[11px] text-primary">Yours</span>}
                  </div>
                  <span className="font-mono text-lg font-semibold tabular-nums">
                    {s.present}
                    <span className="text-sm text-muted-foreground">/{s.total}</span>
                  </span>
                </div>
                <StrengthBar present={s.present} total={s.total} />
                <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
                  <span>
                    <span className="font-medium text-absent">{absent}</span> absent
                  </span>
                  {offCamps > 0 && (
                    <span className="inline-flex items-center gap-1">
                      <Moon className="size-3" />
                      {offCamps} camp{offCamps > 1 ? "s" : ""} off shift
                    </span>
                  )}
                  {dutyCount > 0 && (
                    <span>
                      <span className="font-medium text-duty">+{dutyCount}</span> Extra/RF/SOL
                    </span>
                  )}
                  {subIssues > 0 && (
                    <span className="font-medium text-issue">
                      {subIssues} issue{subIssues > 1 ? "s" : ""}
                    </span>
                  )}
                </div>
              </Card>
            </Link>
          );
        })}
      </section>
    </div>
  );
}
