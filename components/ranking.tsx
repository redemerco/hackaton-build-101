"use client";

import { useState } from "react";
import { Daemon } from "@/components/daemon/daemon";
import { Panel } from "@/components/glass/panel";
import { ShareScoreToggle } from "@/components/share-score-toggle";
import type { BuddyId, DaemonState } from "@/lib/daemon";
import type { TintId } from "@/lib/tints";
import { cn } from "@/lib/utils";

export type RankingEntry = {
  userId: string;
  name: string;
  isMe: boolean;
  buddy: BuddyId;
  tint: TintId;
  score: number | null;
  note?: string; // "5/7 días", "parcial"
};

type Tab = "hoy" | "semana";

const BAR_CELLS = 12;
const TABS: { id: Tab; label: string }[] = [
  { id: "hoy", label: "Hoy" },
  { id: "semana", label: "Semana" },
];

// La cara del compañero según el puntaje: el ranking se lee de un vistazo.
function faceFor(score: number | null): DaemonState {
  if (score === null) return "durmiendo";
  if (score >= 80) return "racha";
  if (score >= 65) return "enforma";
  if (score >= 50) return "bien";
  if (score >= 35) return "cansado";
  return "fundido";
}

function bar(score: number): string {
  const full = Math.round((score / 100) * BAR_CELLS);
  return "█".repeat(full) + "░".repeat(BAR_CELLS - full);
}

/** Ranking del workspace por recuperación (0–100). Las listas llegan ya ordenadas del server. */
type RankingProps = { team: string; today: RankingEntry[]; week: RankingEntry[];  };

export function Ranking({ team, today, week }: RankingProps) {
  const [tab, setTab] = useState<Tab>("hoy");
  const rows = tab === "hoy" ? today : week;
  const hasPartial = rows.some((r) => r.note === "parcial");

  return (
    <Panel label={`ranking · ${team}`} meta="recuperación · 0–100">
      <div className="grid grid-cols-2 gap-2" role="group" aria-label="Período del ranking">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            aria-pressed={tab === t.id}
            onClick={() => setTab(t.id)}
            className={cn("glass press h-10 rounded-xl text-[15px] font-medium transition-[background-color] duration-200", tab === t.id && "bg-mood/25")}
          >
            {t.label}
          </button>
        ))}
      </div>

      <ol className="grid gap-1">
        {rows.map((r, i) => (
          <li
            key={r.userId}
            className={cn(
              "grid grid-cols-[2ch_auto_1fr_auto] items-center gap-x-3 rounded-lg px-2 py-1.5 font-mono text-[13px] tabular-nums",
              r.isMe && "bg-mood/10 shadow-[inset_0_0_0_1px_rgb(241_225_91/.3)]",
            )}
          >
            <span className={cn("text-dim", i === 0 && r.score !== null && "text-mood")}>{r.score === null ? "–" : i + 1}</span>
            <Daemon state={faceFor(r.score)} buddy={r.buddy} tint={r.tint} scale={2} className="-my-2" />
            <span className="min-w-0">
              <span className="block truncate font-sans text-[15px] font-medium">
                {r.name}
                {r.isMe && <span className="ml-1.5 font-mono text-xs text-dim">vos</span>}
              </span>
              {r.score !== null ? (
                <span aria-hidden className="block truncate text-[11px] tracking-[1px] text-mood/80">{bar(r.score)}</span>
              ) : (
                <span className="block text-[11px] text-faint">sin datos de la pulsera</span>
              )}
            </span>
            <span className="text-right">
              <span className="block text-[20px] font-semibold leading-none">{r.score ?? "—"}</span>
              {r.note && <span className="block text-[11px] text-dim">{r.note}</span>}
            </span>
          </li>
        ))}
      </ol>

      <p className="text-xs leading-relaxed text-dim">
        Recuperación de 0 a 100: tu sueño (50), tu HRV y pulso en reposo contra tu propia media (35) y minutos en zona activa (15). Cada uno contra su propia media, no contra los demás. Lo calculamos nosotros: no es el score de Fitbit.
        {hasPartial && " “parcial” = todavía no hay HRV, pulso o línea base: se puntúa sobre lo que hay."} Aparece solo quien eligió entrar, y se comparte solo ese número.
      </p>
      <ShareScoreToggle isOn className="justify-self-start" />
    </Panel>
  );
}
