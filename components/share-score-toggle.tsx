"use client";

import { useTransition } from "react";
import { toast } from "sonner";
import { setShareScore } from "@/app/actions/buddy";
import { cn } from "@/lib/utils";

/** Opt-in del ranking: entrar/salir comparte solo tu recuperación (0–100) con tu workspace, nunca tus datos. */
export function ShareScoreToggle({ isOn, className }: { isOn: boolean; className?: string }) {
  const [isPending, startTransition] = useTransition();
  const toggle = () =>
    startTransition(async () => {
      try {
        await setShareScore(!isOn);
        toast(isOn ? "Saliste del ranking: tu recuperación ya no se comparte" : "Entraste al ranking: tu equipo ve solo tu recuperación");
      } catch {
        toast.error("No se pudo cambiar");
      }
    });
  return (
    <button
      type="button"
      role="switch"
      aria-checked={isOn}
      disabled={isPending}
      onClick={toggle}
      className={cn(
        "glass press h-11 rounded-full px-5 text-[15px] font-semibold transition-[background-color] duration-200 disabled:opacity-60",
        isOn ? "bg-white/[.06] text-dim" : "bg-mood/25",
        className,
      )}
    >
      {isOn ? "Salir del ranking" : "Entrar al ranking"}
    </button>
  );
}
