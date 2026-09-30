// Loads a whole coy (structure, people, current absences, duties) into the DB.
// Used by the one-time Sheets import and the dev seed — NOT by the app itself.
//
// Re-runnable until cutover: subunits and camps are upserted by name (so
// guardcomm platoon assignments survive), while people, absences and duties
// are wiped and reloaded. Users and parade-state history are never touched.

import { and, eq, inArray, notInArray } from "drizzle-orm";
import type { Db } from "@/lib/db";
import { absence, camp, coy, duty, person, subunit } from "@/lib/db/schema";
import type { CoySnapshot } from "@/lib/parade";

export interface CoyInput extends CoySnapshot {
  telegram?: { chatId: string | null; threadId: string | null };
}

export async function writeCoy(db: Db, input: CoyInput) {
  return db.transaction(async (tx) => {
    const settings = {
      displayName: input.coy.displayName,
      ...(input.telegram
        ? { telegramChatId: input.telegram.chatId, telegramThreadId: input.telegram.threadId }
        : {}),
    };
    const [c] = await tx
      .insert(coy)
      .values({ key: input.coy.key, ...settings })
      .onConflictDoUpdate({ target: coy.key, set: settings })
      .returning();

    // wipe roster data for this coy
    const existingCamps = await tx.select({ id: camp.id }).from(camp).where(eq(camp.coyId, c.id));
    const campIds = existingCamps.map((r) => r.id);
    await tx.delete(duty).where(eq(duty.coyId, c.id));
    if (campIds.length) await tx.delete(person).where(inArray(person.campId, campIds)); // cascades absences

    const campIdByName = new Map<string, string>();
    const personIdMap = new Map<string, string>(); // input person id -> DB id
    const keptSubunits: string[] = [];
    const keptCamps: string[] = [];
    let campOrder = 0;
    let people = 0;
    let absences = 0;

    for (const [si, s] of input.subunits.entries()) {
      const [srow] = await tx
        .insert(subunit)
        .values({ coyId: c.id, name: s.name, isHq: s.isHq, sortOrder: si })
        .onConflictDoUpdate({
          target: [subunit.coyId, subunit.name],
          set: { isHq: s.isHq, sortOrder: si },
        })
        .returning();
      keptSubunits.push(srow.id);

      for (const sc of s.camps) {
        const post = sc.post && sc.post !== sc.name ? sc.post : null;
        const [crow] = await tx
          .insert(camp)
          .values({ coyId: c.id, subunitId: srow.id, name: sc.name, post, onShift: sc.onShift, sortOrder: campOrder++ })
          .onConflictDoUpdate({
            target: [camp.coyId, camp.name],
            set: { subunitId: srow.id, post, onShift: sc.onShift, sortOrder: campOrder - 1 },
          })
          .returning();
        keptCamps.push(crow.id);
        campIdByName.set(sc.name, crow.id);
        // snapshot camp ids may be fixture ids; map them too
        campIdByName.set(sc.id, crow.id);

        for (const [pi, p] of sc.people.entries()) {
          const [prow] = await tx
            .insert(person)
            .values({ campId: crow.id, name: p.name, rank: p.rank, role: p.role, sortOrder: pi })
            .returning({ id: person.id });
          personIdMap.set(p.id, prow.id);
          people++;
          if (p.absence) {
            const a = p.absence;
            await tx.insert(absence).values({
              personId: prow.id,
              type: a.type,
              otherReason: a.otherReason,
              startDate: a.startDate,
              startTime: a.startTime,
              endDate: a.endDate,
              endTime: a.endTime,
              maTiming: a.maTiming,
              maLocation: a.maLocation,
            });
            absences++;
          }
        }
      }
    }

    // remove camps/subunits that no longer exist
    await tx.delete(camp).where(and(eq(camp.coyId, c.id), notInArray(camp.id, keptCamps.length ? keptCamps : ["00000000-0000-0000-0000-000000000000"])));
    await tx
      .delete(subunit)
      .where(and(eq(subunit.coyId, c.id), notInArray(subunit.id, keptSubunits.length ? keptSubunits : ["00000000-0000-0000-0000-000000000000"])));

    for (const [di, d] of input.duties.entries()) {
      const campId = campIdByName.get(d.campId);
      if (!campId) throw new Error(`Duty '${d.rank} ${d.name}' points at unknown camp '${d.campId}'`);
      await tx.insert(duty).values({
        coyId: c.id,
        type: d.type,
        rank: d.rank,
        name: d.name,
        personId: d.personId ? (personIdMap.get(d.personId) ?? null) : null,
        campId,
        startDate: d.startDate,
        startTime: d.startTime,
        endDate: d.endDate,
        endTime: d.endTime,
        sortOrder: di,
      });
    }

    return { coyId: c.id, subunits: keptSubunits.length, camps: keptCamps.length, people, absences, duties: input.duties.length };
  });
}
