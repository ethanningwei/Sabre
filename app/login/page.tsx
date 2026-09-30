import { redirect } from "next/navigation";
import { Logo } from "@/components/logo";
import { getViewer } from "@/lib/authz";
import { LoginForm } from "./login-form";

export default async function LoginPage() {
  const viewer = await getViewer();
  if (viewer?.active && viewer.role !== "pending") redirect("/");

  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-10 px-6 py-16">
      <div className="flex flex-col items-center gap-3 text-center">
        <Logo className="size-14" />
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Sabre</h1>
          <p className="text-sm text-muted-foreground">Parade state · 8SIR</p>
        </div>
      </div>
      <LoginForm />
    </main>
  );
}
