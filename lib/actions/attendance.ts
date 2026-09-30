"use server";

import { and, eq, inArray, isNull } from "drizzle-orm";
import { z } from "zod";
import { actionViewer, assertCanEditCamp, assertCanEditPerson } from "@/lib/authz";
import { db } from "@/lib/db";
import { absence, camp, person } from "@/lib/db/schema";
import { ABSENCE_TYPES, DATED_ABSENCE_TYPES } from "@/lib/parade";
import { audit, run, UserError, zDate, zTime } from "./shared";

const statusInput = z.object({
  personIds: z.array(z.string().uuid()).min(1, "Pick at least one person"),
  status: z.enum(["PRESENT", ...ABSENCE_TYPES]),
  otherReason: z.string().max(200).default(""),
  startDate: zDate.default(null),
  startTime: zTime.default(null),
  endDate: zDate.default(null),
  endTime: zTime.default(null),
  maTiming: z.string().max(20).default(""),
  maLocation: z.string().max(100).default(""),
});
export type StatusInput = z.input<typeof statusInput>;

/**
 * Set attendance for one or more people.
 * - PRESENT closes their open absence (kept as history).
 * - Same type as the open absence -> edited in place (e.g. extending an MC).
 * - Different type -> the old one is closed and a new one opened.
 */
export async function setStatus(raw: StatusInput) {
  return run(async () => {
    const viewer = await actionViewer();
    const input = statusInput.parse(raw);
    for (const id of input.personIds) await assertCanEditPerson(viewer, id);

    // an off-shift team isn't printed or counted, so its attendance is locked
    const offShift = await db
      .selectDistinct({ name: camp.name })
      .from(person)
      .innerJoin(camp, eq(camp.id, person.campId))
      .where(and(inArray(person.id, input.personIds), eq(camp.onShift, false)));
    if (offShift.length) {
      throw new UserError(`${offShift.map((c) => c.name).join(", ")} is off shift. Put it on shift to update attendance.`);
    }

    const { status } = input;
    if (status !== "PRESENT") {
      if (DATED_ABSENCE_TYPES.includes(status) && (!input.startDate || !input.endDate)) {
        throw new UserError(`${status} needs a start and end date.`);
      }
      if (status === "MA" && !input.maTiming.trim()) throw new UserError("MA needs a timing, e.g. 1300.");
      if (status === "OTHERS" && !input.otherReason.trim()) throw new UserError("Please give the reason.");
      if (input.startDate && input.endDate) {
        const start = `${input.startDate} ${input.startTime ?? "0000"}`;
        const end = `${input.endDate} ${input.endTime ?? "2359"}`;
        if (end < start) throw new UserError("The end is before the start.");
      }
    }

    const fields =
      status === "PRESENT"
        ? null
        : {
            type: status,
            otherReason: status === "OTHERS" ? input.otherReason.trim() : "",
            startDate: input.startDate,
            startTime: input.startDate ? input.startTime : null,
            endDate: status === "MA" ? null : input.endDate,
            endTime: status === "MA" || !input.endDate ? null : input.endTime,
            maTiming: status === "MA" ? input.maTiming.trim() : "",
            maLocation: status === "MA" ? input.maLocation.trim() : "",
          };

    await db.transaction(async (tx) => {
      for (const personId of input.personIds) {
        const [open] = await tx
          .select()
          .from(absence)
          .where(and(eq(absence.personId, personId), isNull(absence.closedAt)));

        if (!fields) {
          if (!open) continue;
          await tx
            .update(absence)
            .set({ closedAt: new Date(), closedBy: viewer.id })
            .where(eq(absence.id, open.id));
          await audit(tx, viewer, "mark-present", "absence", open.id, open, null);
        } else if (open && open.type === fields.type) {
          const [after] = await tx.update(absence).set(fields).where(eq(absence.id, open.id)).returning();
          await audit(tx, viewer, "update-absence", "absence", open.id, open, after);
        } else {
          if (open) {
            await tx
              .update(absence)
              .set({ closedAt: new Date(), closedBy: viewer.id })
              .where(eq(absence.id, open.id));
          }
          const [created] = await tx
            .insert(absence)
            .values({ personId, createdBy: viewer.id, ...fields })
            .returning();
          await audit(tx, viewer, "set-absence", "absence", created.id, open ?? null, created);
        }
      }
    });
    return undefined;
  });
}

export async function setCampShift(campId: string, onShift: boolean) {
  return run(async () => {
    const viewer = await actionViewer();
    z.string().uuid().parse(campId);
    await assertCanEditCamp(viewer, campId);
    const [before] = await db.select().from(camp).where(eq(camp.id, campId));
    await db.transaction(async (tx) => {
      await tx.update(camp).set({ onShift }).where(eq(camp.id, campId));
      await audit(tx, viewer, onShift ? "shift-on" : "shift-off", "camp", campId, { onShift: before.onShift }, { onShift });
    });
    return undefined;
  });
}
