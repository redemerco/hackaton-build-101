import { Spinner } from "@/components/ascii/spinner";

// Mientras el server arma la pantalla: líneas de log, nunca un blanco.
export default function Loading() {
  return (
    <div className="glass glass-panel grid gap-1.5 rounded-2xl px-4 py-4 font-mono text-[13px] text-dim">
      <Spinner label="leyendo raw_events…" />
      <span className="text-faint">&gt; cruzando sueño × commits</span>
    </div>
  );
}
