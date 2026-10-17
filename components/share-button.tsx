"use client";

import { toast } from "sonner";

/** Hoja nativa de compartir; si no existe (desktop), copia el texto. */
export function ShareButton({ title, text }: { title: string; text: string }) {
  const share = async () => {
    try {
      if (navigator.share) {
        await navigator.share({ title, text });
        return;
      }
      await navigator.clipboard.writeText(text);
      toast("Copiado al portapapeles");
    } catch (error) {
      if ((error as DOMException).name === "AbortError") return; // el usuario cerró la hoja
      console.error("[share]", error);
      toast.error("No se pudo compartir");
    }
  };
  return (
    <button type="button" onClick={share} className="glass press h-12 w-full rounded-full text-[15px] font-semibold">
      Compartir
    </button>
  );
}
