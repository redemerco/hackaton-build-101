"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Spinner } from "@/components/ascii/spinner";
import { ProviderIcon, type ProviderIconId } from "@/components/connect/provider-icons";
import { reactDaemon } from "@/lib/daemon-events";
import type { SourceOverview } from "@/lib/connection-overview";
import { cn } from "@/lib/utils";

// Color de cada marca para el ícono (el resto de la tarjeta usa la paleta de la app).
const BRAND: Record<SourceOverview["id"], { icon: ProviderIconId; bg: string; fg: string }> = {
  github: { icon: "github", bg: "#24292f", fg: "#ffffff" },
  linear: { icon: "linear", bg: "#5e6ad2", fg: "#ffffff" },
  slack: { icon: "slack", bg: "#4a154b", fg: "#ffffff" },
  calendar: { icon: "googlecalendar", bg: "#1a73e8", fg: "#ffffff" },
  health: { icon: "fitbit", bg: "#00b0b9", fg: "#ffffff" },
};

const rtf = new Intl.RelativeTimeFormat("es", { numeric: "auto" });
function ago(iso: string): string {
  const min = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (min < 60) return rtf.format(-Math.max(1, min), "minute");
  if (min < 48 * 60) return rtf.format(-Math.round(min / 60), "hour");
  return rtf.format(-Math.round(min / 1440), "day");
}

type Busy = "sync" | "disconnect" | null;

/** Tarjeta de una fuente: qué leemos (y qué nunca), estado de la conexión, frescura de los datos y acciones. */
export function SourceCard({ s }: { s: SourceOverview }) {
  const router = useRouter();
  const [busy, setBusy] = useState<Busy>(null);
  const brand = BRAND[s.id];
  const isConnected = Boolean(s.account);

  const sync = async () => {
    setBusy("sync");
    try {
      const res = await fetch(`/api/sync/${s.id}`, { cache: "no-store" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const { inserted } = (await res.json()) as { inserted?: number };
      toast(inserted ? `${s.name}: ${inserted} eventos nuevos` : `${s.name} ya estaba al día`);
      if (inserted) reactDaemon({ mood: "happy", text: `${inserted} eventos nuevos de ${s.name.toLowerCase()}.` });
      router.refresh();
    } catch (error) {
      console.error(`[sync/${s.id}]`, error);
      toast.error(`No se pudo sincronizar ${s.name}. Probá de nuevo.`);
    } finally {
      setBusy(null);
    }
  };

  const disconnect = async () => {
    setBusy("disconnect");
    try {
      const res = await fetch(`/api/connect/${s.id}`, { method: "DELETE" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      toast(`${s.name} desconectado`);
      router.refresh();
    } catch (error) {
      console.error(`[connect/${s.id}]`, error);
      toast.error(`No se pudo desconectar ${s.name}`);
    } finally {
      setBusy(null);
    }
  };

  const status = isConnected
    ? { dot: "bg-work", text: `conectado como ${s.account}` }
    : s.connect === "pending"
      ? { dot: "bg-faint", text: `en construcción · ${s.owner}` }
      : !s.configured
        ? { dot: "bg-food", text: "falta configurar en el servidor" }
        : { dot: "bg-white/25", text: "sin conectar" };

  return (
    <article className={cn("grid gap-3 rounded-xl border border-white/10 bg-white/[.04] p-3", s.connect === "pending" && "opacity-70")}>
      <div className="grid grid-cols-[40px_1fr] items-center gap-3">
        <span className="grid size-10 place-items-center rounded-xl shadow-[inset_0_1px_0_rgb(255_255_255/.18)]" style={{ background: brand.bg, color: brand.fg }}>
          <ProviderIcon id={brand.icon} className="size-5" />
        </span>
        <div className="min-w-0">
          <p className="text-[15px] font-semibold">{s.name}</p>
          <p className="flex min-w-0 items-center gap-1.5 font-mono text-xs text-dim">
            <span aria-hidden className={cn("size-1.5 shrink-0 rounded-full", status.dot)} />
            <span className="truncate">{status.text}</span>
          </p>
        </div>
      </div>

      <dl className="grid gap-0.5 text-[13px] leading-snug">
        <div className="flex gap-1.5"><dt className="text-dim">lee</dt><dd>{s.reads}</dd></div>
        <div className="flex gap-1.5"><dt className="text-dim">nunca</dt><dd>{s.never}</dd></div>
      </dl>

      {isConnected && (
        <p className="font-mono text-xs tabular-nums text-dim" suppressHydrationWarning>
          {s.lastEventAt ? `último dato ${ago(s.lastEventAt)} · ${s.events7d} ${s.events7d === 1 ? "evento" : "eventos"} en 7 días` : "conectado, todavía sin datos"}
        </p>
      )}

      {s.connect === "oauth" && (
        <div className="flex gap-2">
          {isConnected ? (
            <>
              <button type="button" onClick={sync} disabled={busy !== null} className="glass press flex h-10 flex-1 items-center justify-center gap-2 rounded-full bg-work/20 text-sm font-semibold disabled:opacity-60">
                {busy === "sync" ? <Spinner label="sincronizando" className="font-mono text-[13px]" /> : "Sincronizar ahora"}
              </button>
              <button type="button" onClick={disconnect} disabled={busy !== null} className="glass press h-10 rounded-full px-4 text-sm font-medium text-dim disabled:opacity-60">
                Desconectar
              </button>
            </>
          ) : s.configured ? (
            // navegación completa: el login es en otra página y vuelve por /api/connect/<p>/callback
            <a href={`/api/connect/${s.id}`} className="glass press flex h-11 flex-1 items-center justify-center gap-2 rounded-full text-[15px] font-semibold" style={{ background: `color-mix(in srgb, ${brand.bg} 70%, transparent)` }}>
              <ProviderIcon id={brand.icon} className="size-4" />
              Conectar {s.name}
            </a>
          ) : null}
        </div>
      )}
    </article>
  );
}

/** La lista de fuentes, igual en Ajustes y en el "Conectá tus fuentes" de Trabajo. */
export function SourcesList({ sources }: { sources: SourceOverview[] }) {
  return (
    <div className="grid gap-2">
      {sources.map((s) => <SourceCard key={s.id} s={s} />)}
    </div>
  );
}
