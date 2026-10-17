import { ViewTransition, type ReactNode } from "react";

const DIRECTIONAL = { "nav-forward": "nav-forward", "nav-back": "nav-back", default: "none" } as const;

/**
 * Envuelve el contenido de cada page.tsx: desliza en la dirección de la tab (lo decide <TabBar>)
 * y los hijos entran en cascada. Va en la página, no en el layout: el layout no se re-monta.
 */
export function Screen({ children }: { children: ReactNode }) {
  return (
    <ViewTransition enter={DIRECTIONAL} exit={DIRECTIONAL} default="none">
      <div className="stagger flex flex-col gap-3">{children}</div>
    </ViewTransition>
  );
}
