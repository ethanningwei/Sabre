import { redirect } from "next/navigation";
import { getViewer } from "@/lib/authz";
import { devAuthEnabled } from "@/lib/auth";
import { LoginForm } from "./login-form";
import { Logo } from "@/components/logo";

export default async function LoginPage() {
  const viewer = await getViewer();
  if (viewer) redirect(viewer.role === "pending" || !viewer.active ? "/pending" : "/");

  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-10 px-6 py-16">
      <div className="flex flex-col items-center gap-3 text-center">
        <Logo className="size-14" />
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Sabre</h1>
          <p className="text-sm text-muted-foreground">Parade state · 8SIR</p>
        </div>
      </div>
      <LoginForm devAuth={devAuthEnabled} googleConfigured={Boolean(process.env.GOOGLE_CLIENT_ID)} />
      <p className="max-w-xs text-center text-xs text-muted-foreground">
        New here? Sign in, then ask an admin to approve your account.
      </p>
    </main>
  );
}
