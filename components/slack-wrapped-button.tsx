"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Spinner } from "@/components/ascii/spinner";
import { ProviderIcon } from "@/components/connect/provider-icons";

/** Manda el Wrapped de la semana al canal de Slack configurado (/api/report/wrapped). */
export function SlackWrappedButton({ canSend }: { canSend: boolean }) {
  const [state, setState] = useState<"idle" | "sending" | "sent">("idle");
  const send = async () => {
    setState("sending");
    try {
      const res = await fetch("/api/report/wrapped", { method: "POST" });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) throw new Error(data.error ?? `error ${res.status}`);
      setState("sent");
      toast("Wrapped mandado a Slack");
    } catch (e) {
      setState("idle");
      toast.error(e instanceof Error ? e.message : "No se pudo mandar a Slack");
    }
  };
  return (
    <button
      type="button"
      onClick={send}
      disabled={!canSend || state !== "idle"}
      title={canSend ? undefined : "Falta configurar SLACK_WEBHOOK_URL en el servidor"}
      className="glass press flex h-12 w-full items-center justify-center gap-2 rounded-full text-[15px] font-semibold disabled:opacity-50"
    >
      {state === "sending" ? (
        <Spinner label="mandando" className="font-mono text-[13px]" />
      ) : (
        <>
          <ProviderIcon id="slack" className="size-4" />
          {state === "sent" ? "✓ En Slack" : canSend ? "Mandar a Slack" : "Slack sin configurar"}
        </>
      )}
    </button>
  );
}
