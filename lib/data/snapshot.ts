// No "server-only" here: the import script (plain Node) uses this too.
import { and, asc, eq, isNull } from "drizzle-orm";
import { db } from "@/lib/db";
import { absence, camp, coy, duty, person, subunit } from "@/lib/db/schema";
import type { CoySnapshot, SnapshotCamp, SnapshotSubunit } from "@/lib/parade";

export type CoyRow = typeof coy.$inferSelect;

/** The MVP serves one coy. */
export async function getCoy(): Promise<CoyRow> {
  const [row] = await db.select().from(coy).orderBy(asc(coy.key)).limit(1);
  if (!row) throw new Error("No coy set up yet — run the import (npm run import) or seed (npm run seed).");
  return row;
}

export async function getCoyByKey(key: string): Promise<CoyRow> {
  const [row] = await db.select().from(coy).where(eq(coy.key, key));
  if (!row) throw new Error(`No coy '${key}'`);
  return row;
}

/** Everything the parade-state engine needs, read in 5 queries. */
export async function loadSnapshot(coyRow: CoyRow): Promise<CoySnapshot> {
  const [subunits, camps, people, absences, duties] = await Promise.all([
    db.select().from(subunit).where(eq(subunit.coyId, coyRow.id)).orderBy(asc(subunit.sortOrder)),
    db.select().from(camp).where(eq(camp.coyId, coyRow.id)).orderBy(asc(camp.sortOrder)),
    db
      .select({ p: person })
      .from(person)
      .innerJoin(camp, eq(camp.id, person.campId))
      .where(and(eq(camp.coyId, coyRow.id), eq(person.active, true)))
      .orderBy(asc(person.sortOrder), asc(person.createdAt)),
    db
      .select({ a: absence })
      .from(absence)
      .innerJoin(person, eq(person.id, absence.personId))
      .innerJoin(camp, eq(camp.id, person.campId))
      .where(and(eq(camp.coyId, coyRow.id), isNull(absence.closedAt))),
    db
      .select()
      .from(duty)
      .where(and(eq(duty.coyId, coyRow.id), isNull(duty.closedAt)))
      .orderBy(asc(duty.sortOrder), asc(duty.createdAt)),
  ]);

  const openAbsence = new Map(absences.map(({ a }) => [a.personId, a]));
  const campsBySubunit = new Map<string, SnapshotCamp[]>();
  const campById = new Map<string, SnapshotCamp>();
  for (const c of camps) {
    const sc: SnapshotCamp = { id: c.id, name: c.name, onShift: c.onShift, people: [] };
    campById.set(c.id, sc);
    campsBySubunit.set(c.subunitId, [...(campsBySubunit.get(c.subunitId) ?? []), sc]);
  }
  for (const { p } of people) {
    const a = openAbsence.get(p.id);
    campById.get(p.campId)?.people.push({
      id: p.id,
      name: p.name,
      rank: p.rank,
      role: p.role,
      absence: a
        ? {
            id: a.id,
            type: a.type,
            otherReason: a.otherReason,
            startDate: a.startDate,
            startTime: a.startTime,
            endDate: a.endDate,
            endTime: a.endTime,
            maTiming: a.maTiming,
            maLocation: a.maLocation,
          }
        : null,
    });
  }

  return {
    coy: { id: coyRow.id, key: coyRow.key, displayName: coyRow.displayName },
    subunits: subunits.map(
      (s): SnapshotSubunit => ({ id: s.id, name: s.name, isHq: s.isHq, camps: campsBySubunit.get(s.id) ?? [] }),
    ),
    duties: duties
      .filter((d) => campById.has(d.campId))
      .map((d) => ({
        id: d.id,
        type: d.type,
        rank: d.rank,
        name: d.name,
        campId: d.campId,
        startDate: d.startDate,
        startTime: d.startTime,
        endDate: d.endDate,
        endTime: d.endTime,
      })),
  };
}
