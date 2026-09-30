import { desc, eq, isNotNull } from "drizzle-orm";
import { ParadeGenerator } from "@/components/parade-generator";
import { requireViewer } from "@/lib/authz";
import { getCoy, loadSnapshot } from "@/lib/data/snapshot";
import { db } from "@/lib/db";
import { paradeState, user } from "@/lib/db/schema";
import { currentCaa, validate } from "@/lib/parade";

export default async function ParadePage() {
  const viewer = await requireViewer();
  const coyRow = await getCoy();
  const caa = currentCaa();
  const issues = validate(await loadSnapshot(coyRow), caa);
  const recentSends = await db
    .select({
      caaDate: paradeState.caaDate,
      caaTime: paradeState.caaTime,
      sentAt: paradeState.sentAt,
      by: user.name,
    })
    .from(paradeState)
    .leftJoin(user, eq(user.id, paradeState.sentBy))
    .where(isNotNull(paradeState.sentAt))
    .orderBy(desc(paradeState.sentAt))
    .limit(20);

  return (
    <ParadeGenerator
      defaultCaa={caa}
      initialIssues={issues}
      isAdmin={viewer.role === "admin"}
      telegramReady={Boolean(coyRow.telegramChatId && process.env.TELEGRAM_BOT_TOKEN)}
      recentSends={recentSends.map((s) => ({ caaDate: s.caaDate, caaTime: s.caaTime, sentAt: s.sentAt!.toISOString(), by: s.by }))}
    />
  );
}
