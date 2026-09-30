import "server-only";
import { eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import { cache } from "react";
import { db } from "@/lib/db";
import { camp, duty, person, user } from "@/lib/db/schema";
import { sessionUserId } from "@/lib/session";

export type Role = "pending" | "guardcomm" | "admin";

export interface Viewer {
  id: string;
  name: string;
  role: Role;
  subunitId: string | null;
  active: boolean;
}

export class ForbiddenError extends Error {
  constructor(message = "You don't have permission to do that.") {
    super(message);
  }
}

/** The signed-in user, re-read from the DB so role/scope changes apply immediately. */
export const getViewer = cache(async (): Promise<Viewer | null> => {
  const userId = await sessionUserId();
  if (!userId) return null;
  const [row] = await db.select().from(user).where(eq(user.id, userId));
  if (!row) return null;
  return { id: row.id, name: row.name, role: row.role, subunitId: row.subunitId, active: row.active };
});

/** For pages: signed in and active — otherwise back to the login page. */
export async function requireViewer(): Promise<Viewer> {
  const viewer = await getViewer();
  if (!viewer || viewer.role === "pending" || !viewer.active) redirect("/login");
  return viewer;
}

export async function requireAdminPage(): Promise<Viewer> {
  const viewer = await requireViewer();
  if (viewer.role !== "admin") redirect("/");
  return viewer;
}

/** For server actions: throws instead of redirecting. */
export async function actionViewer(): Promise<Viewer> {
  const viewer = await getViewer();
  if (!viewer) throw new ForbiddenError("Please sign in again.");
  if (viewer.role === "pending" || !viewer.active) throw new ForbiddenError("Your account isn't approved yet.");
  return viewer;
}

export async function actionAdmin(): Promise<Viewer> {
  const viewer = await actionViewer();
  if (viewer.role !== "admin") throw new ForbiddenError("Only admins can do that.");
  return viewer;
}

export function canEditSubunit(viewer: Viewer, subunitId: string): boolean {
  return viewer.role === "admin" || (viewer.role === "guardcomm" && viewer.subunitId === subunitId);
}

function assertSubunit(viewer: Viewer, subunitId: string | undefined) {
  if (!subunitId) throw new ForbiddenError("Not found.");
  if (!canEditSubunit(viewer, subunitId)) {
    throw new ForbiddenError("You can only edit your own platoon.");
  }
}

export async function assertCanEditCamp(viewer: Viewer, campId: string) {
  const [row] = await db.select({ subunitId: camp.subunitId }).from(camp).where(eq(camp.id, campId));
  assertSubunit(viewer, row?.subunitId);
}

export async function assertCanEditPerson(viewer: Viewer, personId: string) {
  const [row] = await db
    .select({ subunitId: camp.subunitId })
    .from(person)
    .innerJoin(camp, eq(camp.id, person.campId))
    .where(eq(person.id, personId));
  assertSubunit(viewer, row?.subunitId);
}

export async function assertCanEditDuty(viewer: Viewer, dutyId: string) {
  const [row] = await db
    .select({ subunitId: camp.subunitId })
    .from(duty)
    .innerJoin(camp, eq(camp.id, duty.campId))
    .where(eq(duty.id, dutyId));
  assertSubunit(viewer, row?.subunitId);
}
