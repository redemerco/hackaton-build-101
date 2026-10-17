import { buttonVariants } from "@/components/ui/button";

// Pantalla de entrada: login con Google. Un solo OAuth autentica al usuario
// y conecta Fitbit (Google Health) + Calendar. Los demás servicios se conectan
// después desde Ajustes.
export function LoginGate() {
  return (
    <div className="mx-auto flex min-h-dvh max-w-md flex-col items-center justify-center gap-6 px-6 text-center">
      <div className="space-y-2">
        <p className="font-pixel text-[26px] leading-none text-dim">
          ~/<span className="text-foreground">build101</span>
        </p>
        <h1 className="text-xl font-semibold">Tu cuerpo y tu trabajo, en el mismo gráfico</h1>
        <p className="text-sm text-dim">
          Entrá con Google: conecta tu sueño y actividad (Fitbit) y tu calendario en un paso.
          Después sumás GitHub, Linear o Slack si querés.
        </p>
      </div>
      <a
        href="/api/connect/google"
        className={buttonVariants({ variant: "default", size: "lg", className: "w-full max-w-xs" })}
      >
        Iniciar sesión con Google
      </a>
      <p className="text-[11px] text-faint">
        Solo lectura. Nunca leemos el contenido de tus mensajes ni eventos.
      </p>
    </div>
  );
}
