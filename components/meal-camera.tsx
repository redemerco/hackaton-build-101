"use client";

import { useEffect, useId, useState } from "react";
import { toast } from "sonner";
import { AsciiScan } from "@/components/ascii/ascii-scan";
import { Spinner } from "@/components/ascii/spinner";
import { StreamText } from "@/components/ascii/stream-text";
import { Sheet } from "@/components/glass/sheet";
import { EXAMPLE_ANALYSIS, formatRange, totalKcal, type MealAnalysis } from "@/lib/meals";

const MAX_BYTES = 10 * 1024 * 1024;

/**
 * Burbuja de cámara → foto → hoja con el escaneo ASCII → ítems en gramos y rangos de kcal.
 * Usa <input capture> (no getUserMedia: tiene bugs en PWAs standalone de iOS).
 * ponytail: muestra EXAMPLE_ANALYSIS; Renzo reemplaza `analysis` por la respuesta de su endpoint de Gemini.
 */
export function MealCamera() {
  const inputId = useId();
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);
  const [isScanned, setIsScanned] = useState(false);
  const analysis: MealAnalysis = EXAMPLE_ANALYSIS;

  useEffect(() => () => { if (photoUrl) URL.revokeObjectURL(photoUrl); }, [photoUrl]);

  const onFile = (file: File | undefined) => {
    if (!file) return;
    if (!file.type.startsWith("image/")) return toast.error("Eso no es una foto. Probá de nuevo.");
    if (file.size > MAX_BYTES) return toast.error("La foto pesa más de 10 MB. Sacala con menos resolución.");
    setIsScanned(false);
    setPhotoUrl(URL.createObjectURL(file));
  };
  const close = () => setPhotoUrl(null);

  return (
    <>
      <label
        htmlFor={inputId}
        className="glass press mx-auto grid size-24 cursor-pointer place-items-center rounded-full"
        style={{ background: "radial-gradient(circle at 32% 24%, rgb(255 255 255 / .62), transparent 46%), rgb(255 255 255 / .14)" }}
      >
        <span className="size-[72px] rounded-full bg-white/90 shadow-[inset_0_-3px_8px_rgb(0_0_0/.18)]" />
        <span className="sr-only">Sacarle una foto a la comida</span>
      </label>
      <input
        id={inputId}
        type="file"
        accept="image/*"
        capture="environment"
        className="sr-only"
        onChange={(e) => {
          onFile(e.target.files?.[0]);
          e.target.value = "";
        }}
      />

      <Sheet open={photoUrl !== null} onClose={close} title={isScanned ? "Tu plato" : "Analizando"} subtitle="Estimación desde la foto: siempre en rangos.">
        {photoUrl && (
          <div className="relative overflow-hidden rounded-3xl bg-[#07080c]">
            <AsciiScan src={photoUrl} onDone={() => setIsScanned(true)} className="block h-52 w-full" />
            <span className="glass absolute bottom-2.5 left-2.5 rounded-full px-2.5 py-1 font-mono text-[11px]">
              {isScanned ? `✓ ${analysis.items.length} ítems` : <Spinner label="escaneando" />}
            </span>
          </div>
        )}
        {isScanned && <MealResult analysis={analysis} onSave={() => { toast("[meal] guardada"); close(); }} />}
      </Sheet>
    </>
  );
}

function MealResult({ analysis, onSave }: { analysis: MealAnalysis; onSave: () => void }) {
  return (
    <div className="grid gap-3">
      <ul className="grid gap-2">
        {analysis.items.map((it) => (
          <li key={it.name} className="grid grid-cols-[1fr_auto] gap-x-2 text-[13px]">
            <span className="font-medium">{it.name}</span>
            <span className="row-span-2 self-center text-right font-mono text-xs font-semibold tabular-nums text-food">{formatRange(it.kcal)}</span>
            <span className="font-mono text-[11px] tabular-nums text-dim">{formatRange(it.grams)} g</span>
          </li>
        ))}
      </ul>
      <div className="flex items-baseline justify-between border-t border-dashed border-white/20 pt-2">
        <span className="text-xs text-dim">total estimado</span>
        <span className="font-mono text-lg font-semibold tabular-nums text-food">
          {formatRange(totalKcal(analysis.items))} <span className="text-xs font-normal text-dim">kcal</span>
        </span>
      </div>
      <StreamText fallback={analysis.comment} tokenMs={70} className="text-[12.5px] text-foreground/85" />
      <button type="button" onClick={onSave} className="glass press rounded-full bg-food/30 py-3 text-sm font-semibold">
        Guardar comida
      </button>
    </div>
  );
}
