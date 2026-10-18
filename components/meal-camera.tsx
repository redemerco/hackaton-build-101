"use client";

import { useEffect, useId, useState } from "react";
import { CameraIcon } from "lucide-react";
import { toast } from "sonner";
import { Decode } from "@/components/ascii/count";
import { Spinner } from "@/components/ascii/spinner";
import { PixelScan } from "@/components/pixel-scan";
import { StreamText } from "@/components/ascii/stream-text";
import { Sheet } from "@/components/glass/sheet";
import { reactDaemon } from "@/lib/daemon-events";
import { saveMeal } from "@/app/actions/meal";
import { formatRange, scaleItem, totalKcal, type MealAnalysis, type MealItem } from "@/lib/meals";

const MAX_BYTES = 10 * 1024 * 1024;

/**
 * Burbuja de cámara → foto → hoja con el escaneo en mosaico pixel → ítems en gramos y rangos de kcal.
 * Usa <input capture> (no getUserMedia: tiene bugs en PWAs standalone de iOS).
 * Analiza con /api/comer/analizar (Gemini) y "Guardar" escribe la comida en raw_events (app/actions/meal.ts).
 * Sin respuesta válida se muestra el error, nunca datos de ejemplo.
 */
export function MealCamera() {
  const inputId = useId();
  // la última foto, para poder reintentar el análisis sin volver a sacarla
  const [lastFile, setLastFile] = useState<File | null>(null);
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);
  const [isOpen, setIsOpen] = useState(false);
  const [isScanned, setIsScanned] = useState(false);
  const [flashId, setFlashId] = useState(0); // cada foto dispara un flash de obturador
  const [analysis, setAnalysis] = useState<MealAnalysis | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => () => { if (photoUrl) URL.revokeObjectURL(photoUrl); }, [photoUrl]);

  // Manda la foto a Gemini (vía nuestro endpoint) y guarda el análisis real.
  const analyze = async (file: File) => {
    setAnalysis(null);
    setError(null);
    try {
      const body = new FormData();
      body.append("photo", file);
      const res = await fetch("/api/comer/analizar", { method: "POST", body });
      if (!res.ok) {
        // el server dice por qué (sin IA, cuota, foto inválida): se muestra eso, no un consejo genérico
        const data = (await res.json().catch(() => ({}))) as { error?: string; reason?: string };
        throw new Error(data.reason ?? data.error ?? `error ${res.status}`);
      }
      setAnalysis((await res.json()) as MealAnalysis);
    } catch (e) {
      setError(e instanceof Error && e.message !== "Failed to fetch" ? e.message : "sin conexión con el servidor");
    }
  };

  const onFile = (file: File | undefined) => {
    if (!file) return;
    if (!file.type.startsWith("image/")) return toast.error("Eso no es una foto. Probá de nuevo.");
    if (file.size > MAX_BYTES) return toast.error("La foto pesa más de 10 MB. Sacala con menos resolución.");
    setIsScanned(false);
    setFlashId((n) => n + 1);
    setPhotoUrl(URL.createObjectURL(file));
    setIsOpen(true);
    setLastFile(file);
    void analyze(file);
  };
  // Cerrar anima la hoja; la foto se suelta recién en onClose, así el contenido no se vacía mientras baja.
  const close = () => setIsOpen(false);
  const onClosed = () => {
    setIsOpen(false);
    setPhotoUrl(null);
    setAnalysis(null);
    setError(null);
  };

  return (
    <>
      <label
        htmlFor={inputId}
        className="glass press flex h-11 shrink-0 cursor-pointer items-center gap-2 rounded-full bg-food/15 px-4 text-[15px] font-semibold text-food shadow-[inset_0_0_0_1px_var(--food)]"
      >
        <CameraIcon className="size-[18px]" aria-hidden />
        foto
        <span className="sr-only">: sacarle una foto a la comida</span>
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
            <PixelScan src={photoUrl} onDone={() => setIsScanned(true)} className="block aspect-[5/4] w-full" />
            <span className="glass absolute bottom-3 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-full px-3 py-1.5 font-mono text-[13px]">
              {isScanned && analysis ? `✓ ${analysis.items.length} ítems` : isScanned && error ? "✗ sin análisis" : <Spinner label="escaneando" className="font-mono text-[13px]" />}
            </span>
          </div>
        )}
        {isScanned && error && (
          <div className="grid gap-2">
            <p role="alert" className="rounded-lg bg-heart/15 px-3 py-3 text-center font-mono text-[13px] text-heart">
              ✗ no se pudo analizar la foto: {error}
            </p>
            {lastFile && (
              <button type="button" onClick={() => void analyze(lastFile)} className="glass press h-11 rounded-full text-[15px] font-semibold">
                ↻ Reintentar con la misma foto
              </button>
            )}
          </div>
        )}
        {isScanned && !error && !analysis && (
          <div className="grid place-items-center py-6">
            <Spinner label="analizando con IA" className="font-mono text-[13px]" />
          </div>
        )}
        {isScanned && analysis && <MealResult analysis={analysis} onSave={async (items) => {
          try {
            await saveMeal(items, analysis.comment.map((p) => (typeof p === "string" ? p : p.chip)).join(""));
          } catch {
            toast.error("No se pudo guardar la comida. Probá de nuevo.");
            return; // la hoja queda abierta para reintentar
          }
          toast("comida guardada");
          reactDaemon({ mood: "happy", text: "comida anotada. buen provecho." });
          close();
        }} />}
      </Sheet>
    </>
  );
}

const PORTIONS = [0.5, 1, 2] as const;
type Portion = (typeof PORTIONS)[number];
const PORTION_LABEL: Record<Portion, string> = { 0.5: "½×", 1: "1×", 2: "2×" };

/** Resultado: cada ítem se confirma con su porción (patrón MyFitnessPal) antes de guardar. */
function MealResult({ analysis, onSave }: { analysis: MealAnalysis; onSave: (items: MealItem[]) => Promise<void> }) {
  const [portions, setPortions] = useState<Record<string, Portion>>({});
  const [isSaving, setIsSaving] = useState(false);
  const items = analysis.items.map((it) => scaleItem(it, portions[it.name] ?? 1));

  return (
    <div className="stagger grid gap-4">
      <ul className="stagger grid gap-4">
        {items.map((it) => (
          <li key={it.name} className="grid grid-cols-[1fr_auto] items-center gap-x-3 gap-y-1.5 text-[15px]">
            <span className="font-medium">{it.name}</span>
            <Decode text={formatRange(it.kcal)} className="text-right font-mono text-[15px] font-semibold tabular-nums text-food" />
            <span className="font-mono text-[13px] tabular-nums text-dim">{formatRange(it.grams)} g</span>
            <div role="group" aria-label={`Porción de ${it.name}`} className="flex justify-end gap-1">
              {PORTIONS.map((p) => {
                const isOn = (portions[it.name] ?? 1) === p;
                return (
                  <button
                    key={p}
                    type="button"
                    aria-pressed={isOn}
                    onClick={() => setPortions((prev) => ({ ...prev, [it.name]: p }))}
                    className={`press h-9 min-w-11 rounded-lg px-2 font-mono text-[13px] transition-[background-color,color] duration-150 ${isOn ? "bg-food/25 text-food shadow-[inset_0_0_0_1px_var(--food)]" : "bg-white/6 text-dim"}`}
                  >
                    {PORTION_LABEL[p]}
                  </button>
                );
              })}
            </div>
          </li>
        ))}
      </ul>
      <div className="flex items-baseline justify-between border-t border-dashed border-white/20 pt-3">
        <span className="text-sm text-dim">total estimado</span>
        <span className="font-mono text-2xl font-semibold tabular-nums text-food">
          <Decode text={formatRange(totalKcal(items))} /> <span className="text-sm font-normal text-dim">kcal</span>
        </span>
      </div>
      <StreamText fallback={analysis.comment} tokenMs={70} className="text-[15px] leading-relaxed text-foreground/90" />
      <button
        type="button"
        disabled={isSaving}
        onClick={async () => {
          setIsSaving(true);
          await onSave(items);
          setIsSaving(false);
        }}
        className="glass press h-12 rounded-full bg-food/30 text-[15px] font-semibold disabled:opacity-60"
      >
        {isSaving ? "Guardando…" : "Guardar comida"}
      </button>
    </div>
  );
}
