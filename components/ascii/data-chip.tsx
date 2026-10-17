export type Domain = "sleep" | "heart" | "food" | "work" | "mood";

/** Pastilla con el color del dominio del dato: así se sabe de dónde sale cada cifra que dice la IA. */
export function DataChip({ kind, children }: { kind: Domain; children: React.ReactNode }) {
  return (
    <span
      className="whitespace-nowrap rounded-md px-1.5 py-0.5 font-mono text-[13px] font-medium"
      style={{ color: `var(--${kind})`, background: `color-mix(in srgb, var(--${kind}) 16%, transparent)` }}
    >
      {children}
    </span>
  );
}
