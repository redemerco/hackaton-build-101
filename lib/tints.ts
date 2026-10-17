// Colores del compañero. Puro y sin DOM: lo usan el Daemon (cliente), Ajustes y el server.
// Se recolorean solo los 4 tonos del cuerpo (h claro, b base, s sombra, d oscuro), que todos los
// personajes de lib/buddy-art.ts comparten; ojos, cuernos y accesorios quedan como están.

export const TINTS = [
  { id: "original", label: "original", hue: null, sat: null, swatch: null },
  { id: "lavanda", label: "lavanda", hue: 236, sat: 0.72, swatch: "#969df5" },
  { id: "coral", label: "coral", hue: 6, sat: 0.82, swatch: "#ff8a7a" },
  { id: "menta", label: "menta", hue: 168, sat: 0.6, swatch: "#5fd6c6" },
  { id: "cielo", label: "cielo", hue: 205, sat: 0.8, swatch: "#78beff" },
  { id: "ambar", label: "ámbar", hue: 38, sat: 0.9, swatch: "#ffb340" },
  { id: "rosa", label: "rosa", hue: 332, sat: 0.78, swatch: "#ff8fc0" },
  { id: "grafito", label: "grafito", hue: 228, sat: 0.12, swatch: "#5a6079" },
] as const;

export type TintId = (typeof TINTS)[number]["id"];
export const DEFAULT_TINT: TintId = "original";
export const BODY_KEYS = ["h", "b", "s", "d"] as const;

export function isTintId(v: unknown): v is TintId {
  return TINTS.some((t) => t.id === v);
}

function hexToHsl(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1), 16);
  const [r, g, b] = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((c) => c / 255);
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  if (max === min) return [0, 0, l];
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  const h = max === r ? (g - b) / d + (g < b ? 6 : 0) : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return [h * 60, s, l];
}

function hslToHex(h: number, s: number, l: number): string {
  const k = (n: number) => (n + h / 30) % 12;
  const a = s * Math.min(l, 1 - l);
  const f = (n: number) => l - a * Math.max(-1, Math.min(k(n) - 3, 9 - k(n), 1));
  return `#${[f(0), f(8), f(4)].map((v) => Math.round(v * 255).toString(16).padStart(2, "0")).join("")}`;
}

/** Paleta nueva con el cuerpo en el tono elegido; conserva la luz de cada tono para que el sombreado siga igual. */
export function tintPalette(palette: Readonly<Record<string, string>>, tint: TintId): Record<string, string> {
  const t = TINTS.find((x) => x.id === tint);
  if (!t || t.hue === null) return { ...palette };
  const out = { ...palette };
  for (const key of BODY_KEYS) {
    const hex = palette[key];
    if (!hex) continue;
    const [, , l] = hexToHsl(hex);
    out[key] = hslToHex(t.hue, t.sat, l);
  }
  return out;
}
