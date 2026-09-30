"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { authClient } from "@/lib/auth-client";

function GoogleIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden className="size-4">
      <path fill="#EA4335" d="M12 10.2v3.9h5.5c-.2 1.3-1.6 3.9-5.5 3.9-3.3 0-6-2.7-6-6.1s2.7-6.1 6-6.1c1.9 0 3.1.8 3.8 1.5l2.6-2.5C16.8 3.3 14.6 2.3 12 2.3 6.6 2.3 2.3 6.6 2.3 12s4.3 9.7 9.7 9.7c5.6 0 9.3-3.9 9.3-9.5 0-.6-.1-1.1-.2-1.6H12z" />
    </svg>
  );
}

export function LoginForm({ devAuth, googleConfigured }: { devAuth: boolean; googleConfigured: boolean }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);

  async function google() {
    setPending(true);
    const { error } = await authClient.signIn.social({ provider: "google", callbackURL: "/" });
    if (error) {
      toast.error(error.message ?? "Sign-in failed");
      setPending(false);
    }
  }

  async function dev(formData: FormData) {
    setPending(true);
    const email = String(formData.get("email"));
    const password = "dev-password-123";
    const name = email.split("@")[0];
    let { error } = await authClient.signIn.email({ email, password });
    if (error) ({ error } = await authClient.signUp.email({ email, password, name }));
    if (error) {
      toast.error(error.message ?? "Sign-in failed");
      setPending(false);
      return;
    }
    router.replace("/");
    router.refresh();
  }

  return (
    <div className="flex w-full max-w-xs flex-col gap-4">
      <Button size="lg" className="h-12 text-base" variant="outline" onClick={google} disabled={pending || !googleConfigured}>
        <GoogleIcon />
        Continue with Google
      </Button>
      {!googleConfigured && (
        <p className="text-center text-xs text-muted-foreground">Google sign-in isn&apos;t configured yet.</p>
      )}
      {devAuth && (
        <form action={dev} className="flex flex-col gap-2 rounded-xl border border-dashed p-3">
          <p className="text-xs font-medium text-muted-foreground">Local testing only</p>
          <Input name="email" type="email" placeholder="email@example.com" required className="h-10" />
          <Button type="submit" variant="secondary" disabled={pending}>
            Dev sign-in
          </Button>
        </form>
      )}
    </div>
  );
}
