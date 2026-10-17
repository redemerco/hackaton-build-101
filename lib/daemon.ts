// El daemon: qué estado tiene según tus datos, cómo se compone cada cuadro y qué dice.
// Puro (sin DOM ni server-only): lo usan components/daemon y scripts/smoke.mts.
import { ACCESSORIES, CHARACTERS, EYES, MOUTHS, SIZE } from "./buddy-art.ts";
import { DEFAULT_TINT, tintPalette, type TintId } from "./tints.ts";

/** Los compañeros elegibles. Comparten estados y comportamiento; cambia la silueta y la paleta. */
export type BuddyId = keyof typeof CHARACTERS;
export const BUDDIES = Object.keys(CHARACTERS) as BuddyId[];
export const DEFAULT_BUDDY: BuddyId = "daemon";
export const isBuddyId = (v: unknown): v is BuddyId => typeof v === "string" && v in CHARACTERS;
export const buddyName = (id: BuddyId): string => CHARACTERS[id].name;

export type DaemonState =
  | "enforma" | "bien" | "cansado" | "fundido" | "reunionitis" | "buho" | "racha" | "durmiendo" | "comiendo";
export type EyeKind = keyof typeof EYES;
export type MouthKind = keyof typeof MOUTHS;
export type AccessoryKind = keyof typeof ACCESSORIES;
export type Tone = "mood" | "work" | "food" | "heart" | "sleep";

type StateSpec = {
  title: string;     // palabra grande en Hoy
  process: string;   // estado de proceso, en chiquito
  tone: Tone;
  eyes: EyeKind;
  mouth: MouthKind;
  acc: AccessoryKind | null;
  cheeks: boolean;
  melt?: boolean;
  gaze?: [number, number]; // desplazamiento de los ojos (mirar hacia algo)
  blinkEveryMs: number;     // cansado parpadea más seguido y más lento
  blinkMs: number;
};

export const STATES: Record<DaemonState, StateSpec> = {
  enforma: { title: "En forma", process: "running", tone: "mood", eyes: "open", mouth: "smile", acc: "sparkle", cheeks: true, blinkEveryMs: 4200, blinkMs: 130 },
  bien: { title: "Bien", process: "idle", tone: "work", eyes: "open", mouth: "flat", acc: null, cheeks: false, blinkEveryMs: 4000, blinkMs: 140 },
  cansado: { title: "Cansado", process: "throttled", tone: "food", eyes: "tired", mouth: "yawn", acc: "drop", cheeks: false, blinkEveryMs: 2400, blinkMs: 420 },
  fundido: { title: "Fundido", process: "overheat", tone: "heart", eyes: "x", mouth: "wavy", acc: "steam", cheeks: false, melt: true, blinkEveryMs: 1600, blinkMs: 90 },
  reunionitis: { title: "Reunionitis", process: "blocked", tone: "work", eyes: "open", mouth: "flat", acc: "dots", cheeks: false, gaze: [1, -1], blinkEveryMs: 3000, blinkMs: 150 },
  buho: { title: "Búho", process: "night-owl", tone: "sleep", eyes: "wide", mouth: "cat", acc: "moon", cheeks: false, blinkEveryMs: 5200, blinkMs: 110 },
  racha: { title: "En racha", process: "turbo", tone: "mood", eyes: "happy", mouth: "grin", acc: "stars", cheeks: true, blinkEveryMs: 4800, blinkMs: 120 },
  durmiendo: { title: "Durmiendo", process: "asleep", tone: "sleep", eyes: "sleep", mouth: "cat", acc: "zz", cheeks: true, blinkEveryMs: 0, blinkMs: 0 },
  comiendo: { title: "Comiendo", process: "eating", tone: "food", eyes: "happy", mouth: "chew", acc: "note", cheeks: true, blinkEveryMs: 4000, blinkMs: 120 },
};

export type DaemonInput = {
  sleepMin: number;
  avgSleepMin: number;
  meetings: number;
  mood: number | null;          // 1..5 de hoy
  lateCommitAt: string | null;  // "02:14" si anoche hubo commit entre 01 y 05
  mealMinutesAgo: number | null;
  goodNightsStreak: number;     // noches seguidas arriba de tu media
  hour: number;                 // hora local actual
};

/** Gana el estado que más importa. El orden es la regla: lo urgente primero, lo lindo después. */
export function deriveState(i: DaemonInput): DaemonState {
  if (i.hour < 6) return "durmiendo";
  if (i.sleepMin < 300 || i.meetings >= 6) return "fundido";
  if (i.lateCommitAt) return "buho";
  if (i.meetings >= 4) return "reunionitis";
  if (i.sleepMin < i.avgSleepMin - 45 || (i.mood !== null && i.mood <= 2)) return "cansado";
  if (i.mealMinutesAgo !== null && i.mealMinutesAgo <= 30) return "comiendo";
  if (i.goodNightsStreak >= 3) return "racha";
  if (i.sleepMin >= i.avgSleepMin - 15 && i.meetings <= 2) return "enforma";
  return "bien";
}

const fmt = (m: number) => `${Math.floor(m / 60)}h${String(Math.round(m) % 60).padStart(2, "0")}`;

/** Lo que dice, armado con tus datos. Son reglas, no IA: no se presentan como generadas. */
export function linesFor(state: DaemonState, i: DaemonInput): string[] {
  const debt = Math.max(0, i.avgSleepMin - i.sleepMin);
  switch (state) {
    case "enforma":
      return [`dormiste ${fmt(i.sleepMin)}. hay hueco para foco.`, "estado: running. aprovechá la mañana.", "todo en verde. tomá agua igual."];
    case "bien":
      return ["todo en rango. nada que reportar.", `dormiste ${fmt(i.sleepMin)}. día normal.`, "si necesitás algo, tocame."];
    case "cansado":
      return [`dormiste ${fmt(i.sleepMin)}, ${fmt(debt)} menos que tu media.`, "hoy reviews, no refactors.", "una tarea por vez. en serio."];
    case "fundido":
      return i.meetings >= 6
        ? [`${i.meetings} reuniones hoy. el código va a tener que esperar.`, "si pusheás hoy, que sea un typo."]
        : [`${fmt(i.sleepMin)} de sueño. desplegando café…`, "si pusheás hoy, que sea un typo.", "hoy no es día de decisiones grandes."];
    case "reunionitis":
      return [`${i.meetings} reuniones hoy. el foco va a estar en los huecos.`, "buscá 25 min entre reuniones y caminá.", "¿alguna de esas podía ser un mensaje?"];
    case "buho":
      return [`anoche commiteaste a las ${i.lateCommitAt}. hoy no te pido deploys.`, "los commits de madrugada traen más bugs. no lo digo yo, lo dice un paper.", "dormir también es parte del sprint."];
    case "racha":
      return [`${i.goodNightsStreak} noches arriba de tu media. modo turbo.`, "dormir también cuenta. seguí así.", "esto es lo que pasa cuando descansás."];
    case "durmiendo":
      return [`zz… son las ${String(i.hour).padStart(2, "0")}. andá a dormir.`, "el bug sigue mañana. vos también deberías.", "zzz…"];
    case "comiendo":
      return ["anotado. buen provecho.", "ñam. eso también es combustible.", "comer lejos del teclado cuenta doble."];
  }
}

export type Frame = { eyes?: EyeKind; mouth?: MouthKind; gaze?: [number, number] };

function stamp(grid: string[][], x0: number, y0: number, rows: readonly string[], mirror = false) {
  rows.forEach((row, dy) => {
    const r = mirror ? [...row].reverse().join("") : row;
    [...r].forEach((ch, dx) => {
      const y = y0 + dy;
      const x = x0 + dx;
      if (ch !== "." && y >= 0 && y < SIZE && x >= 0 && x < SIZE) grid[y][x] = ch;
    });
  });
}

/** Cuerpo + cara de un compañero para un estado y un cuadro (parpadeo, mirada, reacción). Filas de caracteres de paleta. */
export function composeBody(buddy: BuddyId, state: DaemonState, frame: Frame = {}): string[] {
  const c = CHARACTERS[buddy];
  const spec = STATES[state];
  const grid = (spec.melt ? c.baseMelt : c.base).map((row) => [...row]);
  const eyes = EYES[frame.eyes ?? spec.eyes];
  const [gx, gy] = frame.gaze ?? spec.gaze ?? [0, 0];
  const [[lx, ly], [rx, ry]] = c.eyes;
  stamp(grid, lx + gx, ly + gy, eyes);
  stamp(grid, rx + gx, ry + gy, eyes, true);
  stamp(grid, c.mouth[0], c.mouth[1], MOUTHS[frame.mouth ?? spec.mouth]);
  if (spec.cheeks) c.cheeks.forEach(([x, y]) => stamp(grid, x, y, ["pp"]));
  return grid.map((r) => r.join(""));
}

export function composeAccessory(buddy: BuddyId, kind: AccessoryKind): string[] {
  const grid = Array.from({ length: SIZE }, () => Array<string>(SIZE).fill("."));
  const acc = ACCESSORIES[kind];
  const [dx, dy] = CHARACTERS[buddy].acc;
  stamp(grid, acc.x + dx, acc.y + dy, acc.rows);
  return grid.map((r) => r.join(""));
}

export type Run = { x: number; y: number; w: number; fill: string };

/** Junta píxeles contiguos del mismo color en una fila: ~10× menos <rect> en el SVG. */
/** `tint` recolorea el cuerpo (ver lib/tints.ts); los accesorios se piden sin tint. */
export function toRuns(buddy: BuddyId, rows: readonly string[], tint: TintId = DEFAULT_TINT): Run[] {
  const palette = tintPalette(CHARACTERS[buddy].palette, tint);
  const runs: Run[] = [];
  rows.forEach((row, y) => {
    let x = 0;
    while (x < row.length) {
      const ch = row[x];
      if (ch === ".") {
        x++;
        continue;
      }
      let w = 1;
      while (row[x + w] === ch) w++;
      runs.push({ x, y, w, fill: palette[ch] ?? "#ff00ff" });
      x += w;
    }
  });
  return runs;
}
