import "server-only";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { ForbiddenError, type Viewer } from "@/lib/authz";
import { db } from "@/lib/db";
import { auditLog } from "@/lib/db/schema";

export type ActionResult<T = undefined> = { ok: true; data: T } | { ok: false; error: string };

/** User-fixable problem: shown as a message, not a crash. */
export class UserError extends Error {}

export async function run<T>(fn: () => Promise<T>): Promise<ActionResult<T>> {
  try {
    const data = await fn();
    revalidatePath("/", "layout");
    return { ok: true, data };
  } catch (e) {
    if (e instanceof ForbiddenError || e instanceof UserError) return { ok: false, error: e.message };
    if (e instanceof z.ZodError) return { ok: false, error: e.issues.map((i) => i.message).join("; ") };
    console.error(e);
    return { ok: false, error: "Something went wrong. Please try again." };
  }
}

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

export async function audit(
  tx: Tx | typeof db,
  viewer: Viewer,
  action: string,
  entity: string,
  entityId: string | null,
  before: unknown,
  after: unknown,
) {
  await tx.insert(auditLog).values({
    userId: viewer.id,
    action,
    entity,
    entityId,
    before: before ?? null,
    after: after ?? null,
  });
}

export const zDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Dates must be YYYY-MM-DD")
  .nullable()
  .transform((v) => v || null);

export const zTime = z
  .string()
  .regex(/^([01]\d|2[0-3])[0-5]\d$/, "Times must be HHMM, e.g. 2100")
  .nullable()
  .or(z.literal("").transform(() => null));
