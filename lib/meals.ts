import type { StreamPart } from "@/components/ascii/stream-text";

export type MealItem = { name: string; grams: [number, number]; kcal: [number, number] };
export type MealAnalysis = { items: MealItem[]; comment: readonly StreamPart[] };
export type MealEntry = { time: string; title: string; kcal: [number, number] };

// Siempre rangos: la estimación desde foto tiene ~±30% de error y eso se dice, no se esconde.
export const sumRanges = (ranges: readonly (readonly [number, number])[]): [number, number] =>
  ranges.reduce<[number, number]>(([lo, hi], [a, b]) => [lo + a, hi + b], [0, 0]);
export const totalKcal = (items: readonly { kcal: [number, number] }[]): [number, number] => sumRanges(items.map((it) => it.kcal));

/** Escala gramos y kcal por la porción confirmada (½×, 1×, 2×). Devuelve un ítem nuevo. */
export const scaleItem = (it: MealItem, factor: number): MealItem => ({
  ...it,
  grams: [Math.round(it.grams[0] * factor), Math.round(it.grams[1] * factor)],
  kcal: [Math.round(it.kcal[0] * factor), Math.round(it.kcal[1] * factor)],
});

export const formatRange = ([lo, hi]: readonly [number, number]): string => `${lo}–${hi}`;
