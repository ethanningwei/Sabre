// Full path through the database: writeCoy -> Postgres -> loadSnapshot ->
// render. Must still match the bot's real output character for character.
// Needs the test DB (see vitest.config.mts); skipped if it can't be reached.

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { and, eq, isNull } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { canEditSubunit, type Viewer } from "@/lib/authz";
import { writeCoy } from "@/lib/data/write-coy";
import { db } from "@/lib/db";
import { absence, camp, person, subunit } from "@/lib/db/schema";
import { renderParadeState, validate } from "@/lib/parade";
import { EXAMPLE_CAA, exampleSnapshot } from "../fixtures/example-snapshot";

const golden = readFileSync(join(__dirname, "../fixtures/example-300926.txt"), "utf8");

let reachable = true;
beforeAll(async () => {
  try {
    await db.execute("select 1");
  } catch {
    reachable = false;
  }
});
afterAll(async () => {
  await db.$client.end();
});

async function snapshot() {
  const { loadSnapshot, getCoy } = await import("@/lib/data/snapshot");
  return loadSnapshot(await getCoy());
}

describe("database round trip", () => {
  it("imports the example and renders the golden text from the DB", async (ctx) => {
    if (!reachable) ctx.skip();
    await writeCoy(db, { ...exampleSnapshot(), telegram: { chatId: null, threadId: null } });
    const snap = await snapshot();
    expect(validate(snap, EXAMPLE_CAA)).toEqual([]);
    expect(renderParadeState(snap, EXAMPLE_CAA)).toBe(golden);
  });

  it("re-importing is idempotent", async (ctx) => {
    if (!reachable) ctx.skip();
    await writeCoy(db, { ...exampleSnapshot(), telegram: { chatId: null, threadId: null } });
    expect(renderParadeState(await snapshot(), EXAMPLE_CAA)).toBe(golden);
  });

  it("keeps closed absences as history and allows only one open absence", async (ctx) => {
    if (!reachable) ctx.skip();
    const [p] = await db
      .select({ id: person.id })
      .from(person)
      .innerJoin(camp, eq(camp.id, person.campId))
      .where(and(eq(camp.name, "TFT"), eq(person.name, "TFT PRESENT 1")));
    await db.insert(absence).values({ personId: p.id, type: "MC", startDate: "2026-09-30", endDate: "2026-10-01" });
    await expect(
      db.insert(absence).values({ personId: p.id, type: "AL", startDate: "2026-09-30", endDate: "2026-10-01" }),
    ).rejects.toThrow();

    let text = renderParadeState(await snapshot(), EXAMPLE_CAA);
    expect(text).toContain("TFT\n• Total Strength: 04\n• Present Strength: 03\n");
    expect(text).toContain("1. PTE TFT PRESENT 1 (MC 300926 - 011026)");

    await db.update(absence).set({ closedAt: new Date() }).where(and(eq(absence.personId, p.id), isNull(absence.closedAt)));
    text = renderParadeState(await snapshot(), EXAMPLE_CAA);
    expect(text).toBe(golden);
    const history = await db.select().from(absence).where(eq(absence.personId, p.id));
    expect(history).toHaveLength(1);
  });
});

describe("platoon scope", () => {
  const base: Viewer = { id: "u", name: "GC", email: "gc@x", image: null, role: "guardcomm", subunitId: null, active: true };

  it("guardcomms edit only their own platoon; admins edit everything; pending edits nothing", async (ctx) => {
    if (!reachable) ctx.skip();
    const subs = await db.select().from(subunit);
    const p5 = subs.find((s) => s.name === "PLATOON 5")!;
    const p6 = subs.find((s) => s.name === "PLATOON 6")!;
    const gc = { ...base, subunitId: p5.id };
    expect(canEditSubunit(gc, p5.id)).toBe(true);
    expect(canEditSubunit(gc, p6.id)).toBe(false);
    expect(canEditSubunit({ ...base, role: "admin" }, p6.id)).toBe(true);
    expect(canEditSubunit({ ...base, role: "pending", subunitId: p5.id }, p5.id)).toBe(false);
  });
});
