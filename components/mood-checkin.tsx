"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { saveMood } from "@/app/actions/mood";
import { Sheet } from "@/components/glass/sheet";
import { STAT_CARD, STAT_HINT, STAT_LABEL } from "@/components/stat-card";
import { MOODS, moodFace } from "@/lib/ascii";
import { reactDaemon } from "@/lib/daemon-events";
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
        reactDaemon(value >= 4
          ? { mood: "happy", text: `ánimo ${value}/5. anotado, me alegro.` }
          : value <= 2
            ? { mood: "sad", text: `ánimo ${value}/5. anotado. hoy vamos despacio.` }
            : { mood: "surprised", text: `ánimo ${value}/5. anotado.` });
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
        className={`${STAT_CARD} press text-left`}
      >
        <span className={STAT_LABEL}>ánimo</span>
        <span className="font-pixel text-[22px] leading-none">{moodFace(mood)}</span>
        <span className={`${STAT_HINT} text-mood`}>{mood ? `${mood}/5 · tocá` : "tocá"}</span>
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
                "glass press grid justify-items-center gap-2 rounded-xl pb-2.5 pt-3.5 text-xs font-medium transition-[background-color,box-shadow] duration-200 disabled:opacity-60",
                picked === m.value && "bg-mood/25 shadow-[inset_0_0_0_1px_var(--mood)]",
              )}
            >
              <span className="font-pixel text-[22px] leading-none">{m.face}</span>
              {m.label}
            </button>
          ))}
        </div>
      </Sheet>
    </>
  );
}
