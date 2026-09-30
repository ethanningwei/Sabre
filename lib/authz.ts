import "server-only";
import { eq } from "drizzle-orm";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { cache } from "react";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { camp, duty, person, user } from "@/lib/db/schema";

export type Role = "pending" | "guardcomm" | "admin";

export interface Viewer {
  id: string;
  name: string;
  email: string;
  image: string | null;
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
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) return null;
  const [row] = await db.select().from(user).where(eq(user.id, session.user.id));
  if (!row) return null;
  return {
    id: row.id,
    name: row.name,
    email: row.email,
    image: row.image,
    role: row.role,
    subunitId: row.subunitId,
    active: row.active,
  };
});

/** For pages: signed in, approved and active — otherwise redirect. */
export async function requireViewer(): Promise<Viewer> {
  const viewer = await getViewer();
  if (!viewer) redirect("/login");
  if (viewer.role === "pending" || !viewer.active) redirect("/pending");
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
