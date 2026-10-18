import { ProviderIcon } from "@/components/connect/provider-icons";
import { Daemon } from "@/components/daemon/daemon";
import type { BuddyId } from "@/lib/daemon";

// Pantalla de entrada: login con Google. Un solo OAuth autentica al usuario y conecta
// Fitbit (Google Health) + Calendar. GitHub, Linear y Slack se suman después desde Ajustes.
const STEPS = [
  { icon: "fitbit", text: "Tu sueño por etapas desde la Fitbit" },
  { icon: "googlecalendar", text: "Tus reuniones, sin títulos ni invitados" },
] as const;

export function LoginGate({ buddy }: { buddy: BuddyId }) {
  return (
    <main className="stagger mx-auto flex min-h-dvh max-w-md flex-col justify-center gap-6 px-6 pb-[max(2rem,env(safe-area-inset-bottom))] pt-[max(2rem,env(safe-area-inset-top))]">
      <div className="grid justify-items-center gap-4 text-center">
        <Daemon state="enforma" buddy={buddy} scale={4} />
        <p className="font-pixel text-[22px] leading-none text-dim">
          ~/<span className="text-foreground">pulso</span>
        </p>
        <h1 className="text-balance text-[26px] font-semibold leading-tight">Tu cuerpo y tu trabajo, en el mismo gráfico.</h1>
      </div>

      <section className="glass glass-panel grid gap-3 rounded-2xl px-4 py-4">
        <p className="font-mono text-[11px] font-medium uppercase tracking-[0.08em] text-dim">un login, dos fuentes</p>
        <ul className="grid gap-2.5">
          {STEPS.map((s) => (
            <li key={s.icon} className="flex items-center gap-3 text-[15px]">
              <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-white/[.08]">
                <ProviderIcon id={s.icon} className="size-4" />
              </span>
              {s.text}
            </li>
          ))}
        </ul>
        <p className="text-sm text-dim">Después sumás GitHub, Linear o Slack desde Ajustes, si querés.</p>
      </section>

      {/* <a> a propósito: /api/connect/google redirige a Google, necesita navegación completa (no <Link>) */}
      {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
      <a
        href="/api/connect/google"
        className="press flex h-12 items-center justify-center gap-3 rounded-full bg-white text-[15px] font-semibold text-[#1f1f1f] shadow-[0_10px_30px_rgb(0_0_0/.35)]"
      >
        <svg viewBox="0 0 24 24" aria-hidden className="size-5">
          <path fill="#4285F4" d="M23.5 12.27c0-.8-.07-1.57-.2-2.31H12v4.37h6.46a5.52 5.52 0 0 1-2.4 3.62v3h3.88c2.27-2.09 3.56-5.17 3.56-8.68Z" />
          <path fill="#34A853" d="M12 24c3.24 0 5.96-1.07 7.94-2.91l-3.88-3c-1.07.72-2.45 1.15-4.06 1.15-3.12 0-5.77-2.11-6.71-4.95H1.28v3.1A12 12 0 0 0 12 24Z" />
          <path fill="#FBBC05" d="M5.29 14.29a7.2 7.2 0 0 1 0-4.58v-3.1H1.28a12 12 0 0 0 0 10.78l4.01-3.1Z" />
          <path fill="#EA4335" d="M12 4.76c1.76 0 3.34.61 4.59 1.8l3.44-3.44A11.5 11.5 0 0 0 12 0 12 12 0 0 0 1.28 6.61l4.01 3.1C6.23 6.87 8.88 4.76 12 4.76Z" />
        </svg>
        Continuar con Google
      </a>

      <p className="text-center font-mono text-xs leading-relaxed text-dim">
        solo lectura · nunca leemos el contenido de tus mensajes ni eventos · con tu equipo solo compartís un puntaje
      </p>
    </main>
  );
}
