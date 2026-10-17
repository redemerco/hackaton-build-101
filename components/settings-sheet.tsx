"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { setBuddy, setTint } from "@/app/actions/buddy";
import { deleteMyData } from "@/app/actions/data";
import { logout } from "@/app/actions/user";
import { SourcesList } from "@/components/connect/source-card";
import { Daemon } from "@/components/daemon/daemon";
import { Sheet } from "@/components/glass/sheet";
import { PushToggle } from "@/components/push-toggle";
import type { SourceOverview } from "@/lib/connection-overview";
import { BUDDIES, buddyName, type BuddyId } from "@/lib/daemon";
import { TINTS, type TintId } from "@/lib/tints";
import { cn } from "@/lib/utils";

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="grid gap-2">
      <h3 className="font-mono text-[11px] font-medium uppercase tracking-[0.08em] text-dim">{title}</h3>
      {children}
    </section>
  );
}

/** Chip de usuario del header: abre Ajustes (usuario, notificaciones, conexiones, tus datos). */
type SettingsSheetProps = { userName: string; currentBuddy: BuddyId; currentTint: TintId; sources: SourceOverview[] };

export function SettingsSheet({ userName, currentBuddy, currentTint, sources }: SettingsSheetProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [isConfirmingDelete, setIsConfirmingDelete] = useState(false);
  const [isPending, startTransition] = useTransition();
  // El usuario es quien se logueó con Google: mostramos su cuenta, no un selector.
  const account = sources.find((s) => s.id === "health")?.account ?? null;
  const label = userName && userName !== "Invitado" ? userName : account ?? "Mi cuenta";

  const pickBuddy = (id: BuddyId) =>
    startTransition(async () => {
      try {
        await setBuddy(id);
        toast(`${buddyName(id)} es tu compañero`);
      } catch {
        toast.error("No se pudo cambiar de compañero");
      }
    });

  const pickTint = (id: TintId) =>
    startTransition(async () => {
      try {
        await setTint(id);
      } catch {
        toast.error("No se pudo cambiar el color");
      }
    });

  const signOut = () =>
    startTransition(async () => {
      try {
        await logout();
      } catch (error) {
        // redirect() de la action llega como "error" de navegación: no es una falla
        if (error instanceof Error && error.message.includes("NEXT_REDIRECT")) return;
        toast.error("No se pudo cerrar la sesión");
      }
    });

  const wipe = () =>
    startTransition(async () => {
      try {
        const n = await deleteMyData();
        toast(`Borrados ${n} eventos`);
        setIsConfirmingDelete(false);
      } catch {
        toast.error("No se pudieron borrar los datos");
      }
    });

  return (
    <>
      <button type="button" onClick={() => setIsOpen(true)} className="glass press h-11 min-w-11 max-w-[200px] truncate rounded-full px-4 text-sm font-medium">
        {label}
      </button>
      <Sheet open={isOpen} onClose={() => { setIsOpen(false); setIsConfirmingDelete(false); }} title="Ajustes" subtitle="Tus datos, tu dispositivo. Con tu equipo solo compartís el puntaje.">
        <Section title="tu compañero">
          <div className="grid grid-cols-4 gap-2" role="group" aria-label="Elegí tu compañero">
            {BUDDIES.map((id) => (
              <button
                key={id}
                type="button"
                disabled={isPending}
                aria-pressed={id === currentBuddy}
                onClick={() => pickBuddy(id)}
                className={cn(
                  "glass press grid justify-items-center gap-1 rounded-xl pb-2 pt-1 text-xs font-medium transition-[background-color,box-shadow] duration-200 disabled:opacity-60",
                  id === currentBuddy && "bg-mood/20 shadow-[inset_0_0_0_1px_var(--mood)]",
                )}
              >
                <Daemon key={`${id}-${id === currentBuddy}`} state={id === currentBuddy ? "racha" : "bien"} buddy={id} scale={2} />
                {buddyName(id)}
              </button>
            ))}
          </div>
          <div className="flex flex-wrap gap-2 pt-1" role="group" aria-label="Color de tu compañero">
            {TINTS.map((t) => (
              <button
                key={t.id}
                type="button"
                disabled={isPending}
                aria-pressed={t.id === currentTint}
                aria-label={t.label}
                title={t.label}
                onClick={() => pickTint(t.id)}
                className={cn(
                  "press grid size-11 place-items-center rounded-full transition-[box-shadow] duration-200 disabled:opacity-60",
                  t.id === currentTint ? "shadow-[0_0_0_2px_var(--mood)]" : "shadow-[inset_0_0_0_1px_rgb(255_255_255/.14)]",
                )}
              >
                {t.swatch ? (
                  <span className="size-7 rounded-full" style={{ background: t.swatch }} />
                ) : (
                  <span className="font-mono text-[11px] text-dim">orig</span>
                )}
              </button>
            ))}
          </div>
        </Section>

        <Section title="notificaciones">
          <PushToggle />
        </Section>

        <Section title="conexiones">
          <SourcesList sources={sources} />
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

        <Section title="sesión">
          <div className="flex items-center justify-between gap-3">
            <p className="min-w-0 truncate text-sm text-dim">{account ? `Entraste como ${account}` : "Sesión abierta"}</p>
            <button type="button" disabled={isPending} onClick={signOut} className="glass press h-11 shrink-0 rounded-full px-5 text-[15px] font-medium disabled:opacity-60">
              Cerrar sesión
            </button>
          </div>
        </Section>
      </Sheet>
    </>
  );
}
