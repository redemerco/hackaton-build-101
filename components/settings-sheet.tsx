"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { deleteMyData } from "@/app/actions/data";
import { setCurrentUser } from "@/app/actions/user";
import { Sheet } from "@/components/glass/sheet";
import { PushToggle } from "@/components/push-toggle";
import { USERS, type UserId } from "@/lib/user-list";
import { cn } from "@/lib/utils";

const CONNECTIONS = [
  { name: "Google Health", owner: "Renzo" },
  { name: "Google Calendar", owner: "Joaco" },
  { name: "GitHub", owner: "Joaco" },
  { name: "Linear", owner: "Joaco" },
] as const;

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="grid gap-2">
      <h3 className="font-mono text-[11px] font-medium uppercase tracking-[0.08em] text-dim">{title}</h3>
      {children}
    </section>
  );
}

/** Chip de usuario del header: abre Ajustes (usuario, notificaciones, conexiones, tus datos). */
export function SettingsSheet({ currentUserId }: { currentUserId: UserId }) {
  const [isOpen, setIsOpen] = useState(false);
  const [isConfirmingDelete, setIsConfirmingDelete] = useState(false);
  const [isPending, startTransition] = useTransition();
  const current = USERS.find((u) => u.id === currentUserId) ?? USERS[0];

  const switchUser = (id: UserId) =>
    startTransition(async () => {
      try {
        await setCurrentUser(id);
        setIsOpen(false);
      } catch {
        toast.error("No se pudo cambiar de usuario");
      }
    });

  const wipe = () =>
    startTransition(async () => {
      try {
        const n = await deleteMyData();
        toast(`Borrados ${n} eventos de ${current.name}`);
        setIsConfirmingDelete(false);
      } catch {
        toast.error("No se pudieron borrar los datos");
      }
    });

  return (
    <>
      <button type="button" onClick={() => setIsOpen(true)} className="glass press h-10 rounded-full px-4 text-sm font-medium">
        {current.id} ▾
      </button>
      <Sheet open={isOpen} onClose={() => { setIsOpen(false); setIsConfirmingDelete(false); }} title="Ajustes" subtitle="Tus datos, tu dispositivo. Nadie más los ve.">
        <Section title="usuario">
          <div className="grid grid-cols-3 gap-2">
            {USERS.map((u) => (
              <button
                key={u.id}
                type="button"
                disabled={isPending}
                aria-pressed={u.id === current.id}
                onClick={() => switchUser(u.id)}
                className={cn("glass press h-11 rounded-xl text-[15px] font-medium transition-[background-color] duration-200 disabled:opacity-60", u.id === current.id && "bg-mood/25")}
              >
                {u.name}
              </button>
            ))}
          </div>
        </Section>

        <Section title="notificaciones">
          <PushToggle />
        </Section>

        <Section title="conexiones">
          <ul className="grid gap-2 font-mono text-sm">
            {CONNECTIONS.map((c) => (
              <li key={c.name} className="flex justify-between">
                <span>{c.name}</span>
                <span className="text-dim">[pendiente · {c.owner}]</span>
              </li>
            ))}
          </ul>
        </Section>

        <Section title="esto es tuyo">
          <div className="grid grid-cols-2 gap-2">
            <a href="/api/export" className="glass press grid h-11 place-items-center rounded-full text-[15px] font-medium">Exportar JSON</a>
            {isConfirmingDelete ? (
              <button type="button" disabled={isPending} onClick={wipe} className="glass press h-11 rounded-full bg-heart/30 text-[15px] font-semibold disabled:opacity-60">
                Sí, borrar todo
              </button>
            ) : (
              <button type="button" onClick={() => setIsConfirmingDelete(true)} className="glass press h-11 rounded-full text-[15px] font-medium text-heart">
                Borrar mis datos
              </button>
            )}
          </div>
          {isConfirmingDelete && <p className="text-sm text-dim">Borra tus comidas, ánimo y datos de salud y trabajo de esta app. No se puede deshacer.</p>}
        </Section>
      </Sheet>
    </>
  );
}
