"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { saveMood } from "@/app/actions/mood";
import { Sheet } from "@/components/glass/sheet";
import { MOODS, moodFace } from "@/lib/ascii";
import { cn } from "@/lib/utils";

/** El vital de ánimo en Hoy: al tocarlo abre la hoja con las 5 caras. Un toque guarda. */
export function MoodCheckin({ mood }: { mood: number | null }) {
  const [isOpen, setIsOpen] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [picked, setPicked] = useState(mood);

  const pick = (value: number) => {
    setPicked(value);
    startTransition(async () => {
      try {
        await saveMood(value);
        toast(`[mood] ${value}/5 guardado`);
        setIsOpen(false);
      } catch (error) {
        console.error("[mood]", error);
        toast.error("No se pudo guardar el ánimo. Probá de nuevo.");
      }
    });
  };

  return (
    <>
      <button
        type="button"
        onClick={() => setIsOpen(true)}
        className="glass glass-panel press grid min-w-0 gap-0.5 rounded-2xl px-3 py-2.5 text-left"
      >
        <span className="font-mono text-[9.5px] font-medium uppercase tracking-[0.08em] text-dim">ánimo</span>
        <span className="font-pixel text-[11px] leading-7">{moodFace(mood)}</span>
        <span className="truncate font-mono text-[11px] text-mood">{mood ? `${mood}/5 · tocá` : "tocá para contar"}</span>
      </button>

      <Sheet open={isOpen} onClose={() => setIsOpen(false)} title="¿Cómo venís?" subtitle="Un toque por día. Se cruza con tu sueño y tu semana.">
        <div className="grid grid-cols-5 gap-1.5" role="group" aria-label="Elegí tu ánimo">
          {MOODS.map((m) => (
            <button
              key={m.value}
              type="button"
              disabled={isPending}
              aria-pressed={picked === m.value}
              onClick={() => pick(m.value)}
              className={cn(
                "glass press grid justify-items-center gap-1 rounded-2xl pb-2 pt-3 text-[10px] font-medium disabled:opacity-60",
                picked === m.value && "bg-mood/25 shadow-[inset_0_0_0_1px_var(--mood)]",
              )}
            >
              <span className="font-pixel text-[11px]">{m.face}</span>
              {m.label}
            </button>
          ))}
        </div>
      </Sheet>
    </>
  );
}
