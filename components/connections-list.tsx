"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import type { Provider } from "@/lib/connections";

// Providers que se conectan desde Ajustes (google es el login de entrada, no va acá).
type Connectable = Exclude<Provider, "google">;

export type ConnectionStatus = Record<Connectable, string | null>;
/** Si el servidor tiene el CLIENT_ID del proveedor; sin eso, "Conectar" no puede arrancar el login. */
export type ConnectionConfig = Record<Connectable, boolean>;

// Las que se conectan por OAuth de usuario (backend de Joaco: /api/connect/<p>). Health y Calendar los conecta Renzo.
const OAUTH: { id: Connectable; name: string; what: string }[] = [
  { id: "github", name: "GitHub", what: "commits y PRs" },
  { id: "linear", name: "Linear", what: "issues" },
  { id: "slack", name: "Slack", what: "solo horarios, nunca mensajes" },
];
const PENDING = [
  { name: "Google Health", owner: "Renzo" },
  { name: "Google Calendar", owner: "Renzo" },
];

/** Conexiones en Ajustes: "Conectar" arranca el login del proveedor; al volver, ConnectionToast avisa. */
export function ConnectionsList({ status, configured }: { status: ConnectionStatus; configured: ConnectionConfig }) {
  const router = useRouter();
  const [busy, setBusy] = useState<Connectable | null>(null);

  const disconnect = async (id: Connectable, name: string) => {
    setBusy(id);
    try {
      const res = await fetch(`/api/connect/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      toast(`${name} desconectado`);
      router.refresh();
    } catch (error) {
      console.error("[connections]", error);
      toast.error(`No se pudo desconectar ${name}`);
    } finally {
      setBusy(null);
    }
  };

  return (
    <ul className="grid gap-2">
      {OAUTH.map(({ id, name, what }) => {
        const account = status[id];
        return (
          <li key={id} className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="text-[15px] font-medium">{name}</p>
              <p className="truncate font-mono text-xs text-dim">{account ? `conectado como ${account}` : what}</p>
            </div>
            {account ? (
              <button
                type="button"
                disabled={busy === id}
                onClick={() => disconnect(id, name)}
                className="glass press h-10 shrink-0 rounded-full px-4 text-sm font-medium text-dim disabled:opacity-60"
              >
                Desconectar
              </button>
            ) : !configured[id] ? (
              <span className="shrink-0 font-mono text-xs text-faint">[falta configurar]</span>
            ) : (
              // navegación completa: el login del proveedor es otra página y vuelve por el callback
              <a href={`/api/connect/${id}`} className="glass press grid h-10 shrink-0 place-items-center rounded-full bg-work/20 px-4 text-sm font-semibold">
                Conectar
              </a>
            )}
          </li>
        );
      })}
      {PENDING.map((p) => (
        <li key={p.name} className="flex items-center justify-between gap-3">
          <p className="text-[15px] font-medium text-dim">{p.name}</p>
          <span className="font-mono text-xs text-faint">[pendiente · {p.owner}]</span>
        </li>
      ))}
    </ul>
  );
}
