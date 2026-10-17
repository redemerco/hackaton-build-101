"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";

function urlBase64ToUint8Array(base64: string): Uint8Array<ArrayBuffer> {
  const padded = (base64 + "=".repeat((4 - (base64.length % 4)) % 4)).replace(/-/g, "+").replace(/_/g, "/");
  return Uint8Array.from(atob(padded), (c) => c.charCodeAt(0));
}

type Status = "loading" | "unsupported" | "off" | "on";

// Registra /sw.js, suscribe al push y permite mandar uno de prueba. En iOS requiere la PWA instalada.
export function PushToggle() {
  const [status, setStatus] = useState<Status>("loading");

  useEffect(() => {
    const isSupported = "serviceWorker" in navigator && "PushManager" in window;
    const check: Promise<Status> = isSupported
      ? navigator.serviceWorker
          .register("/sw.js", { scope: "/", updateViaCache: "none" })
          .then((reg) => reg.pushManager.getSubscription())
          .then((sub) => (sub ? "on" : "off"))
      : Promise.resolve("unsupported");
    check.catch((): Status => "unsupported").then(setStatus);
  }, []);

  async function subscribe() {
    const key = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
    if (!key) return toast.error("Falta NEXT_PUBLIC_VAPID_PUBLIC_KEY en .env.local");
    try {
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlBase64ToUint8Array(key) });
      const res = await fetch("/api/push/subscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ subscription: sub.toJSON() }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setStatus("on");
      toast.success("Notificaciones activadas");
    } catch (error) {
      console.error("[push] suscripción falló", error);
      toast.error("No se pudieron activar las notificaciones");
    }
  }

  async function sendTest() {
    const res = await fetch("/api/push/test", { method: "POST" });
    const body = (await res.json()) as { sent?: number; error?: string };
    if (!res.ok) return toast.error(body.error ?? "Falló el envío");
    toast(body.sent ? `Push enviado a ${body.sent} dispositivo(s)` : "No hay dispositivos suscritos");
  }

  if (status === "loading") return null;
  if (status === "unsupported") {
    return <p className="text-sm text-muted-foreground">Push no disponible acá. En iPhone: Compartir → Agregar a inicio.</p>;
  }
  return status === "on" ? (
    <Button variant="outline" onClick={sendTest}>
      Enviar push de prueba
    </Button>
  ) : (
    <Button onClick={subscribe}>Activar notificaciones</Button>
  );
}
