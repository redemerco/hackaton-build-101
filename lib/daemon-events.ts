// Canal para que cualquier parte de la app le avise al daemon que pasó algo (guardaste ánimo, comida, sync).
export type DaemonReaction = { mood: "happy" | "surprised" | "sad"; text?: string };

const EVENT = "daemon:react";

export function reactDaemon(reaction: DaemonReaction): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent<DaemonReaction>(EVENT, { detail: reaction }));
}

export function onDaemonReaction(handler: (r: DaemonReaction) => void): () => void {
  const listener = (e: Event) => handler((e as CustomEvent<DaemonReaction>).detail);
  window.addEventListener(EVENT, listener);
  return () => window.removeEventListener(EVENT, listener);
}
