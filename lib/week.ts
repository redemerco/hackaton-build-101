// Tipos compartidos del digest y el Wrapped. La data de ejemplo se eliminó: todo sale de raw_events.

export type WrappedRow = { label: string; value: string; spark?: string; note?: string; kind: "sleep" | "work" | "food" | "mood" };

export type WrappedHighlight = { id: string; kind: WrappedRow["kind"]; big: string; label: string; spark: string; caption: string };
