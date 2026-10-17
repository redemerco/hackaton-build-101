import type { StreamPart } from "@/components/ascii/stream-text";

// ponytail: digest y Wrapped de ejemplo hasta que Joaco tenga /api/digest; el digest real usa este mismo texto como respaldo cacheado.
export const EXAMPLE_DIGEST: readonly StreamPart[] = [
  "Esta semana dormiste en promedio ",
  { chip: "6h48", kind: "sleep" },
  " y tuviste ",
  { chip: "11 reuniones", kind: "work" },
  ". Tu mejor día fue el martes: ",
  { chip: "7h40 de sueño", kind: "sleep" },
  ", una sola reunión y ",
  { chip: "11 commits", kind: "work" },
  ". Los días que almorzaste antes de las 14 tu ánimo promedió ",
  { chip: "4/5", kind: "mood" },
  ". Ojo con el jueves: ",
  { chip: "6 reuniones", kind: "work" },
  " y el pulso en reposo subió a ",
  { chip: "66 bpm", kind: "heart" },
  ".",
];

export type WrappedRow = { label: string; value: string; spark?: string; note?: string; kind: "sleep" | "work" | "food" | "mood" };

export type WrappedHighlight = { id: string; kind: WrappedRow["kind"]; big: string; label: string; spark: string; caption: string };

export const EXAMPLE_WRAPPED = {
  week: 42,
  // Abre con identidad, como Spotify/Oura: un arquetipo antes que los números.
  archetype: { name: "Búho de merges", why: "9 de tus 37 commits fueron después de la 1 de la mañana" },
  rows: [
    { label: "sueño prom.", value: "6h04", spark: "▅▃▂▁▃▆▅", kind: "sleep" },
    { label: "commits", value: "37", spark: "▂▅█▃▁▁▆", kind: "work" },
    { label: "reuniones", value: "14", spark: "▃▃▆█▂▁▁", kind: "work" },
    { label: "comidas", value: "19", note: "3 milanesas", kind: "food" },
    { label: "ánimo", value: "._.", note: "3.4 / 5", kind: "mood" },
  ] satisfies WrappedRow[],
  bestDay: { name: "martes", lines: ["7h40 dormido · 1 reunión", "11 commits · ánimo ^_^"] },
  // Una slide por dato: número grande, su forma en ASCII y una frase con el contexto.
  highlights: [
    { id: "sueno", kind: "sleep", big: "6h04", label: "dormiste por noche", spark: "▅▃▂▁▃▆▅", caption: "38 min menos que tu media. El jueves tocaste fondo: 4h12." },
    { id: "commits", kind: "work", big: "37", label: "commits", spark: "▂▅█▃▁▁▆", caption: "El martes fue tu mejor día: 11 commits con una sola reunión." },
    { id: "reuniones", kind: "work", big: "14", label: "reuniones", spark: "▃▃▆█▂▁▁", caption: "6 el jueves. Ese día hiciste 1 commit." },
    { id: "comidas", kind: "food", big: "19", label: "comidas fotografiadas", spark: "▃▄▃▆▅▂▃", caption: "3 milanesas, todas en días de deploy." },
  ] satisfies WrappedHighlight[],
  isExample: true,
};
