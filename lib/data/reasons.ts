import "server-only";
import { and, count, desc, eq, gt, ne } from "drizzle-orm";
import { db } from "@/lib/db";
import { absence } from "@/lib/db/schema";

/** Most-used OTHERS reasons from the last 90 days, for autocomplete. */
export async function getReasonSuggestions(limit = 40): Promise<string[]> {
  const since = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);
  const rows = await db
    .select({ reason: absence.otherReason, n: count() })
    .from(absence)
    .where(and(eq(absence.type, "OTHERS"), ne(absence.otherReason, ""), gt(absence.createdAt, since)))
    .groupBy(absence.otherReason)
    .orderBy(desc(count()))
    .limit(limit);
  return rows.map((r) => r.reason.trim()).filter((r, i, all) => r && all.indexOf(r) === i);
}
