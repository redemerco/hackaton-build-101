"use client";

import { useTransition } from "react";
import { toast } from "sonner";
import { setCurrentUser } from "@/app/actions/user";
import { USERS, type UserId } from "@/lib/user-list";

// <select> nativo: en el teléfono abre el picker del sistema, mejor que un dropdown custom.
export function UserSwitcher({ currentUserId }: { currentUserId: UserId }) {
  const [isPending, startTransition] = useTransition();

  return (
    <select
      aria-label="Usuario"
      value={currentUserId}
      disabled={isPending}
      onChange={(e) => {
        const id = e.target.value;
        startTransition(async () => {
          try {
            await setCurrentUser(id);
          } catch {
            toast.error("No se pudo cambiar de usuario");
          }
        });
      }}
      className="h-8 rounded-md border bg-card px-2 text-sm disabled:opacity-50"
    >
      {USERS.map((u) => (
        <option key={u.id} value={u.id}>
          {u.name}
        </option>
      ))}
    </select>
  );
}
