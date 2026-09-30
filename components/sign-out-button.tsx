"use client";

import { useRouter } from "next/navigation";
import { LogOut } from "lucide-react";
import { Button } from "@/components/ui/button";
import { authClient } from "@/lib/auth-client";

export function SignOutButton({ variant = "ghost" }: { variant?: "ghost" | "outline" }) {
  const router = useRouter();
  return (
    <Button
      variant={variant}
      onClick={async () => {
        await authClient.signOut();
        router.replace("/login");
        router.refresh();
      }}
    >
      <LogOut />
      Sign out
    </Button>
  );
}
