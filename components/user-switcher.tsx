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
      className="glass press h-8 appearance-none rounded-full bg-transparent px-3 text-xs font-medium disabled:opacity-50"
    >
      {USERS.map((u) => (
        <option key={u.id} value={u.id}>
          {u.name}
        </option>
      ))}
    </select>
  );
}
