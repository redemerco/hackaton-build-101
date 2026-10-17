import type { StreamPart } from "@/components/ascii/stream-text";

export type MealItem = { name: string; grams: [number, number]; kcal: [number, number] };
export type MealAnalysis = { items: MealItem[]; comment: readonly StreamPart[] };
export type MealEntry = { time: string; title: string; kcal: [number, number] };

// Siempre rangos: la estimación desde foto tiene ~±30% de error y eso se dice, no se esconde.
export const sumRanges = (ranges: readonly (readonly [number, number])[]): [number, number] =>
  ranges.reduce<[number, number]>(([lo, hi], [a, b]) => [lo + a, hi + b], [0, 0]);
export const totalKcal = (items: readonly { kcal: [number, number] }[]): [number, number] => sumRanges(items.map((it) => it.kcal));

export const formatRange = ([lo, hi]: readonly [number, number]): string => `${lo}–${hi}`;

// ponytail: análisis de ejemplo hasta que Renzo conecte Gemini vision; misma forma que debería devolver el endpoint.
export const EXAMPLE_ANALYSIS: MealAnalysis = {
  items: [
    { name: "Milanesa de carne", grams: [160, 200], kcal: [380, 470] },
    { name: "Papas fritas", grams: [120, 150], kcal: [360, 450] },
    { name: "Ensalada con tomate", grams: [80, 120], kcal: [20, 40] },
  ],
  comment: ["Tercera milanesa de la semana de deploy. Sin juicio, pero sumale agua."],
};

export const EXAMPLE_MEALS_TODAY: MealEntry[] = [
  { time: "09:12", title: "Café con leche y medialunas", kcal: [320, 420] },
  { time: "13:40", title: "Milanesa con papas", kcal: [760, 960] },
];
