"use client";

import { Loader2 } from "lucide-react";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { updateUser } from "@/lib/actions/admin";
import { cn } from "@/lib/utils";

type Role = "pending" | "guardcomm" | "admin";

interface UserRow {
  id: string;
  name: string;
  email: string;
  image: string | null;
  role: Role;
  subunitId: string | null;
  active: boolean;
  createdAt: string;
}

const ROLES: { value: Role; label: string }[] = [
  { value: "pending", label: "Pending" },
  { value: "guardcomm", label: "Guardcomm" },
  { value: "admin", label: "Admin" },
];

export function UsersList({
  users,
  subunits,
  viewerId,
}: {
  users: UserRow[];
  subunits: { id: string; name: string }[];
  viewerId: string;
}) {
  return (
    <ul className="flex flex-col gap-3">
      {users.map((u) => (
        <UserCard key={`${u.id}:${u.role}:${u.subunitId}:${u.active}`} user={u} subunits={subunits} isSelf={u.id === viewerId} />
      ))}
    </ul>
  );
}

function UserCard({ user, subunits, isSelf }: { user: UserRow; subunits: { id: string; name: string }[]; isSelf: boolean }) {
  const [role, setRole] = useState<Role>(user.role === "pending" ? "guardcomm" : user.role);
  const [subunitId, setSubunitId] = useState(user.subunitId ?? "");
  const [active, setActive] = useState(user.active);
  const [pending, startTransition] = useTransition();
  const isPending = user.role === "pending";
  const dirty = isPending || role !== user.role || (subunitId || null) !== user.subunitId || active !== user.active;

  function save() {
    startTransition(async () => {
      const res = await updateUser({ userId: user.id, role, subunitId: subunitId || null, active });
      if (res.ok) toast.success(isPending ? `${user.name} approved` : "Saved");
      else toast.error(res.error);
    });
  }

  return (
    <li className={cn("flex flex-col gap-3 rounded-xl border bg-card p-4", isPending && "border-absent/50 bg-absent/5")}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate font-medium">
            {user.name} {isSelf && <span className="text-xs text-muted-foreground">(you)</span>}
          </p>
          <p className="truncate text-sm text-muted-foreground">{user.email}</p>
        </div>
        {isPending && (
          <span className="shrink-0 rounded-full bg-absent/20 px-2 py-0.5 text-xs font-semibold text-absent">Waiting</span>
        )}
      </div>

      <div className="grid grid-cols-3 gap-1 rounded-lg bg-muted p-1">
        {ROLES.map((r) => (
          <button
            key={r.value}
            onClick={() => setRole(r.value)}
            disabled={isSelf}
            className={cn(
              "h-9 rounded-md text-sm font-medium transition-colors disabled:opacity-60",
              role === r.value ? "bg-background shadow-sm" : "text-muted-foreground",
            )}
          >
            {r.label}
          </button>
        ))}
      </div>

      {role === "guardcomm" && (
        <div className="flex flex-col gap-1.5">
          <Label className="text-xs text-muted-foreground">Platoon they can edit</Label>
          <select
            value={subunitId}
            onChange={(e) => setSubunitId(e.target.value)}
            className="h-11 rounded-lg border bg-background px-3 text-sm"
          >
            <option value="">Choose…</option>
            {subunits.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </div>
      )}

      <div className="flex items-center justify-between">
        <label className="flex items-center gap-2 text-sm">
          <Switch checked={active} onCheckedChange={(v: boolean) => setActive(v)} disabled={isSelf} />
          {active ? "Active" : "Disabled"}
        </label>
        <Button onClick={save} disabled={!dirty || pending || (role === "guardcomm" && !subunitId)}>
          {pending && <Loader2 className="animate-spin" />}
          {isPending ? "Approve" : "Save"}
        </Button>
      </div>
    </li>
  );
}
