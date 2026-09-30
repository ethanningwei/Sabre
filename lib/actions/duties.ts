"use server";

import { and, eq, isNull, max } from "drizzle-orm";
import { z } from "zod";
import { actionViewer, assertCanEditCamp, assertCanEditDuty } from "@/lib/authz";
import { db } from "@/lib/db";
import { camp, duty } from "@/lib/db/schema";
import { DUTY_TYPES } from "@/lib/parade";
import { audit, run, UserError, zDate, zTime } from "./shared";

const dutyInput = z.object({
  id: z.string().uuid().optional(),
  type: z.enum(DUTY_TYPES),
  rank: z.string().trim().min(1, "Rank is required").max(20),
  name: z.string().trim().min(1, "Name is required").max(100),
  personId: z.string().uuid().nullable().default(null),
  campId: z.string().uuid(),
  startDate: zDate,
  startTime: zTime.default(null),
  endDate: zDate,
  endTime: zTime.default(null),
});
export type DutyInput = z.input<typeof dutyInput>;

export async function saveDuty(raw: DutyInput) {
  return run(async () => {
    const viewer = await actionViewer();
    const input = dutyInput.parse(raw);
    if (!input.startDate || !input.endDate) throw new UserError("Start and end dates are required.");
    if (input.endDate < input.startDate) throw new UserError("The end is before the start.");
    await assertCanEditCamp(viewer, input.campId);

    const [c] = await db.select({ coyId: camp.coyId }).from(camp).where(eq(camp.id, input.campId));
    const values = {
      type: input.type,
      rank: input.rank,
      name: input.name,
      personId: input.personId,
      campId: input.campId,
      startDate: input.startDate,
      startTime: input.startTime,
      endDate: input.endDate,
      endTime: input.endTime,
    };

    return db.transaction(async (tx) => {
      if (input.id) {
        await assertCanEditDuty(viewer, input.id); // must own the duty's current camp too
        const [before] = await tx.select().from(duty).where(eq(duty.id, input.id));
        const [after] = await tx.update(duty).set(values).where(eq(duty.id, input.id)).returning();
        await audit(tx, viewer, "update-duty", "duty", input.id, before, after);
        return after.id;
      }
      const [{ last }] = await tx
        .select({ last: max(duty.sortOrder) })
        .from(duty)
        .where(and(eq(duty.campId, input.campId), isNull(duty.closedAt)));
      const [created] = await tx
        .insert(duty)
        .values({ ...values, coyId: c.coyId, sortOrder: (last ?? -1) + 1, createdBy: viewer.id })
        .returning();
      await audit(tx, viewer, "create-duty", "duty", created.id, null, created);
      return created.id;
    });
  });
}

/** Finished serving: removed from the parade state, kept as history. */
export async function endDuty(dutyId: string) {
  return run(async () => {
    const viewer = await actionViewer();
    z.string().uuid().parse(dutyId);
    await assertCanEditDuty(viewer, dutyId);
    await db.transaction(async (tx) => {
      const [before] = await tx
        .update(duty)
        .set({ closedAt: new Date(), closedBy: viewer.id })
        .where(eq(duty.id, dutyId))
        .returning();
      await audit(tx, viewer, "end-duty", "duty", dutyId, before, null);
    });
    return undefined;
  });
}
