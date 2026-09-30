"use server";

import { and, eq, isNull, max } from "drizzle-orm";
import { z } from "zod";
import { actionViewer, assertCanEditCamp, assertCanEditDuty } from "@/lib/authz";
import { db } from "@/lib/db";
import { absence, camp, duty, person } from "@/lib/db/schema";
import { DUTY_TYPES } from "@/lib/parade";
import { audit, run, UserError, zDate, zTime } from "./shared";

const dutyInput = z.object({
  id: z.string().uuid().optional(),
  type: z.enum(DUTY_TYPES),
  rank: z.string().trim().max(20).default(""),
  name: z.string().trim().max(100).default(""),
  /** someone on this coy's roster; required for SOL */
  personId: z.string().uuid().nullable().default(null),
  /** where an Extra/RF serves; ignored for SOL (it follows the person's home team) */
  campId: z.string().uuid().nullable().default(null),
  startDate: zDate,
  startTime: zTime.default(null),
  endDate: zDate,
  endTime: zTime.default(null),
});
export type DutyInput = z.input<typeof dutyInput>;

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

/**
 * Rules (the Sheets left these to people to remember):
 * - SOL is served with your own camp. It's tied to the person; while their team
 *   is on shift they're simply present, and when it's off they count as SOL
 *   under the on-shift team of the same physical camp. There's no camp to pick.
 * - Extra/RF are served at ANOTHER team, never their own. A roster person is
 *   marked absent at home as OTHERS "RF @ BDK" for the same dates, so they're
 *   never counted twice; that absence follows the duty and closes with it.
 */
export async function saveDuty(raw: DutyInput) {
  return run(async () => {
    const viewer = await actionViewer();
    const input = dutyInput.parse(raw);
    if (!input.startDate || !input.endDate) throw new UserError("Start and end dates are required.");
    if (input.endDate < input.startDate) throw new UserError("The end is before the start.");

    let rank = input.rank;
    let name = input.name;
    let home: typeof camp.$inferSelect | null = null;
    if (input.personId) {
      const [row] = await db
        .select({ p: person, c: camp })
        .from(person)
        .innerJoin(camp, eq(camp.id, person.campId))
        .where(and(eq(person.id, input.personId), eq(person.active, true)));
      if (!row) throw new UserError("That person is no longer on the roster.");
      rank = row.p.rank;
      name = row.p.name;
      home = row.c;
    }
    if (!rank || !name) throw new UserError("Rank and name are required.");

    let campId: string;
    if (input.type === "SOL") {
      if (!home) throw new UserError("Pick the person from the roster: SOL is served with their own camp.");
      campId = home.id;
    } else {
      if (!input.campId) throw new UserError("Pick the camp they're serving at.");
      if (home && input.campId === home.id) {
        throw new UserError(`${input.type} can't be served at their own team (${home.name}). Pick another camp.`);
      }
      campId = input.campId;
    }
    await assertCanEditCamp(viewer, campId);
    const [target] = await db.select().from(camp).where(eq(camp.id, campId));

    const values = {
      type: input.type,
      rank,
      name,
      personId: input.personId,
      campId,
      startDate: input.startDate,
      startTime: input.startTime,
      endDate: input.endDate,
      endTime: input.endTime,
    };

    return db.transaction(async (tx) => {
      let saved: typeof duty.$inferSelect;
      if (input.id) {
        await assertCanEditDuty(viewer, input.id); // must own the duty's current camp too
        const [before] = await tx.select().from(duty).where(eq(duty.id, input.id));
        [saved] = await tx.update(duty).set(values).where(eq(duty.id, input.id)).returning();
        await audit(tx, viewer, "update-duty", "duty", input.id, before, saved);
      } else {
        const [{ last }] = await tx
          .select({ last: max(duty.sortOrder) })
          .from(duty)
          .where(and(eq(duty.campId, campId), isNull(duty.closedAt)));
        [saved] = await tx
          .insert(duty)
          .values({ ...values, coyId: target.coyId, sortOrder: (last ?? -1) + 1, createdBy: viewer.id })
          .returning();
        await audit(tx, viewer, "create-duty", "duty", saved.id, null, saved);
      }
      await syncHomeAbsence(tx, saved, target.name, viewer.id);
      return saved.id;
    });
  });
}

/** Keep the "RF @ BDK" absence at the person's home team in step with the duty. */
async function syncHomeAbsence(tx: Tx, d: typeof duty.$inferSelect, servingAt: string, userId: string) {
  const [linked] = await tx
    .select()
    .from(absence)
    .where(and(eq(absence.dutyId, d.id), isNull(absence.closedAt)));
  const wanted = d.personId && d.type !== "SOL";

  if (linked && (!wanted || linked.personId !== d.personId)) {
    await tx.update(absence).set({ closedAt: new Date(), closedBy: userId }).where(eq(absence.id, linked.id));
  }
  if (!wanted) return;

  const fields = {
    type: "OTHERS" as const,
    otherReason: `${d.type} @ ${servingAt}`,
    startDate: d.startDate,
    startTime: d.startTime,
    endDate: d.endDate,
    endTime: d.endTime,
    maTiming: "",
    maLocation: "",
  };
  if (linked && linked.personId === d.personId) {
    await tx.update(absence).set(fields).where(eq(absence.id, linked.id));
    return;
  }
  const [other] = await tx
    .select()
    .from(absence)
    .where(and(eq(absence.personId, d.personId!), isNull(absence.closedAt)));
  // already absent at home (e.g. an MC): not counted there either way, so keep
  // their real absence rather than overwrite it
  if (other) return;
  await tx.insert(absence).values({ personId: d.personId!, dutyId: d.id, createdBy: userId, ...fields });
}

/** Finished serving: removed from the parade state (and their home absence closed), kept as history. */
export async function endDuty(dutyId: string) {
  return run(async () => {
    const viewer = await actionViewer();
    z.string().uuid().parse(dutyId);
    await assertCanEditDuty(viewer, dutyId);
    await db.transaction(async (tx) => {
      const now = new Date();
      const [before] = await tx
        .update(duty)
        .set({ closedAt: now, closedBy: viewer.id })
        .where(eq(duty.id, dutyId))
        .returning();
      await tx
        .update(absence)
        .set({ closedAt: now, closedBy: viewer.id })
        .where(and(eq(absence.dutyId, dutyId), isNull(absence.closedAt)));
      await audit(tx, viewer, "end-duty", "duty", dutyId, before, null);
    });
    return undefined;
  });
}
