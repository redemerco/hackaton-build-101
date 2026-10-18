"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";

function urlBase64ToUint8Array(base64: string): Uint8Array<ArrayBuffer> {
  const padded = (base64 + "=".repeat((4 - (base64.length % 4)) % 4)).replace(/-/g, "+").replace(/_/g, "/");
  return Uint8Array.from(atob(padded), (c) => c.charCodeAt(0));
}

type Status = "loading" | "unsupported" | "off" | "on";

/** ¿La suscripción del navegador es de la VAPID pública actual? */
function sameKey(sub: PushSubscription): boolean {
  const key = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  const current = sub.options.applicationServerKey;
  if (!key || !current) return true; // sin dato para comparar: no tocar
  const a = new Uint8Array(current);
  const b = urlBase64ToUint8Array(key);
  return a.length === b.length && a.every((x, i) => x === b[i]);
}

async function saveOnServer(sub: PushSubscription) {
  const res = await fetch("/api/push/subscribe", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ subscription: sub.toJSON() }),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
}

// Registra /sw.js y suscribe al push. En iOS requiere la PWA instalada.
export function PushToggle() {
  const [status, setStatus] = useState<Status>("loading");

  useEffect(() => {
    const isSupported = "serviceWorker" in navigator && "PushManager" in window;
    const check: Promise<Status> = isSupported
      ? navigator.serviceWorker
          .register("/sw.js", { scope: "/", updateViaCache: "none" })
          .then((reg) => reg.pushManager.getSubscription())
          .then(async (sub) => {
            if (!sub) return "off";
            // Suscripción de otras VAPID (se rotaron las claves): el server no la puede usar → se descarta y se pide de nuevo.
            if (!sameKey(sub)) {
              await sub.unsubscribe().catch(() => {});
              return "off";
            }
            // Re-sincroniza con el server por si su copia se perdió (DB nueva, otro deploy): es idempotente.
            await saveOnServer(sub).catch(() => {});
            return "on";
          })
      : Promise.resolve("unsupported");
    check.catch((): Status => "unsupported").then(setStatus);
  }, []);

  async function subscribe() {
    const key = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
    if (!key) return toast.error("Falta NEXT_PUBLIC_VAPID_PUBLIC_KEY en .env.local");
    try {
      const reg = await navigator.serviceWorker.ready;
      // Si quedó una suscripción con otra clave, subscribe() tira InvalidStateError: hay que soltarla antes.
      const prev = await reg.pushManager.getSubscription();
      if (prev && !sameKey(prev)) await prev.unsubscribe();
      const sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlBase64ToUint8Array(key) });
      await saveOnServer(sub);
      setStatus("on");
      toast.success("Notificaciones activadas");
    } catch (error) {
      console.error("[push] suscripción falló", error);
      toast.error("No se pudieron activar las notificaciones");
    }
  }

  if (status === "loading") return null;
  if (status === "unsupported") {
    return <p className="text-sm text-muted-foreground">Push no disponible acá. En iPhone: Compartir → Agregar a inicio.</p>;
  }
  return status === "on" ? (
    <p className="text-sm text-muted-foreground">Notificaciones activadas</p>
  ) : (
    <Button onClick={subscribe}>Activar notificaciones</Button>
  );
}
