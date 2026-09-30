import { Clock } from "lucide-react";
import { redirect } from "next/navigation";
import { getViewer } from "@/lib/authz";
import { SignOutButton } from "@/components/sign-out-button";

export default async function PendingPage() {
  const viewer = await getViewer();
  if (!viewer) redirect("/login");
  if (viewer.role !== "pending" && viewer.active) redirect("/");

  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-6 px-6 py-16 text-center">
      <div className="grid size-14 place-items-center rounded-full bg-muted">
        <Clock className="size-6 text-muted-foreground" />
      </div>
      <div className="space-y-2">
        <h1 className="text-xl font-semibold">{viewer.active ? "Waiting for approval" : "Account disabled"}</h1>
        <p className="max-w-sm text-sm text-muted-foreground">
          You&apos;re signed in as <span className="font-medium text-foreground">{viewer.email}</span>.{" "}
          {viewer.active
            ? "An admin needs to approve your account and assign your platoon before you can continue."
            : "Ask an admin to re-enable your account."}
        </p>
      </div>
      <SignOutButton variant="outline" />
    </main>
  );
}
