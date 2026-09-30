import { AdminHeader } from "@/components/admin-header";
import { SettingsForm } from "@/components/admin/settings-form";
import { requireAdminPage } from "@/lib/authz";
import { getCoy } from "@/lib/data/snapshot";

export default async function SettingsPage() {
  await requireAdminPage();
  const coyRow = await getCoy();
  return (
    <div className="flex flex-col gap-5">
      <AdminHeader title="Coy settings" />
      <SettingsForm
        displayName={coyRow.displayName}
        telegramChatId={coyRow.telegramChatId ?? ""}
        telegramThreadId={coyRow.telegramThreadId ?? ""}
        tokenSet={Boolean(process.env.TELEGRAM_BOT_TOKEN)}
      />
    </div>
  );
}
