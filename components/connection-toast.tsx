"use client";

import { useEffect } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { toast } from "sonner";
import { reactDaemon } from "@/lib/daemon-events";

const NAMES: Record<string, string> = { github: "GitHub", linear: "Linear", slack: "Slack" };
const WAIT_FOR_DAEMON_MS = 400; // que el compañero ya esté montado para festejar

/** Al volver del login de un proveedor (?conexion=github-ok|github-error): avisa, festeja y limpia la URL. */
export function ConnectionToast() {
  const params = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const value = params.get("conexion");

  useEffect(() => {
    if (!value) return;
    const [provider, result] = value.split("-");
    const name = NAMES[provider] ?? provider;
    if (result === "ok") {
      toast.success(`${name} conectado`);
      setTimeout(() => reactDaemon({ mood: "happy", text: `${name.toLowerCase()} conectado. ya veo tus datos.` }), WAIT_FOR_DAEMON_MS);
    } else {
      toast.error(`No se pudo conectar ${name}. Probá de nuevo desde Ajustes.`);
    }
    router.replace(pathname, { scroll: false });
  }, [value, pathname, router]);

  return null;
}
