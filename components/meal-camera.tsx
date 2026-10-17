"use client";

import { useEffect, useId, useState } from "react";
import { toast } from "sonner";
import { AsciiScan } from "@/components/ascii/ascii-scan";
import { Decode } from "@/components/ascii/count";
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
  const [isOpen, setIsOpen] = useState(false);
  const [isScanned, setIsScanned] = useState(false);
  const [flashId, setFlashId] = useState(0); // cada foto dispara un flash de obturador
  const analysis: MealAnalysis = EXAMPLE_ANALYSIS;

  useEffect(() => () => { if (photoUrl) URL.revokeObjectURL(photoUrl); }, [photoUrl]);

  const onFile = (file: File | undefined) => {
    if (!file) return;
    if (!file.type.startsWith("image/")) return toast.error("Eso no es una foto. Probá de nuevo.");
    if (file.size > MAX_BYTES) return toast.error("La foto pesa más de 10 MB. Sacala con menos resolución.");
    setIsScanned(false);
    setFlashId((n) => n + 1);
    setPhotoUrl(URL.createObjectURL(file));
    setIsOpen(true);
  };
  // Cerrar anima la hoja; la foto se suelta recién en onClose, así el contenido no se vacía mientras baja.
  const close = () => setIsOpen(false);
  const onClosed = () => {
    setIsOpen(false);
    setPhotoUrl(null);
  };

  return (
    <>
      <label
        htmlFor={inputId}
        className="glass press press-strong mx-auto grid size-24 cursor-pointer place-items-center rounded-full"
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

      {flashId > 0 && <span key={flashId} aria-hidden className="camera-flash" />}
      <Sheet open={isOpen} onClose={onClosed} title={isScanned ? "Tu plato" : "Analizando"} subtitle="Estimación desde la foto: siempre en rangos.">
        {photoUrl && (
          <div className="relative overflow-hidden rounded-xl bg-[#07080c] ring-1 ring-inset ring-white/10">
            <AsciiScan src={photoUrl} onDone={() => setIsScanned(true)} className="block aspect-[5/4] w-full" />
            <span className="glass absolute bottom-3 left-3 rounded-full px-3 py-1.5 font-mono text-[13px]">
              {isScanned ? `✓ ${analysis.items.length} ítems` : <Spinner label="escaneando" className="font-mono text-[13px]" />}
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
    <div className="stagger grid gap-4">
      <ul className="stagger grid gap-3">
        {analysis.items.map((it) => (
          <li key={it.name} className="grid grid-cols-[1fr_auto] gap-x-3 gap-y-0.5 text-[15px]">
            <span className="font-medium">{it.name}</span>
            <Decode text={formatRange(it.kcal)} className="row-span-2 self-center text-right font-mono text-[15px] font-semibold tabular-nums text-food" />
            <span className="font-mono text-[13px] tabular-nums text-dim">{formatRange(it.grams)} g</span>
          </li>
        ))}
      </ul>
      <div className="flex items-baseline justify-between border-t border-dashed border-white/20 pt-3">
        <span className="text-sm text-dim">total estimado</span>
        <span className="font-mono text-2xl font-semibold tabular-nums text-food">
          <Decode text={formatRange(totalKcal(analysis.items))} /> <span className="text-sm font-normal text-dim">kcal</span>
        </span>
      </div>
      <StreamText fallback={analysis.comment} tokenMs={70} className="text-[15px] leading-relaxed text-foreground/90" />
      <button type="button" onClick={onSave} className="glass press h-12 rounded-full bg-food/30 text-[15px] font-semibold">
        Guardar comida
      </button>
    </div>
  );
}
