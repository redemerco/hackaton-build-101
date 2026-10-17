export type Commit = { time: string; message: string; additions: number; deletions: number };
export type WorkLogEntry = ({ type: "commit" } & Commit) | { type: "pr"; title: string };

export type WorkDay = {
  log: WorkLogEntry[];
  commits: number;
  /** Reuniones en franjas de 20 min entre 09 y 18 h: [desde, hasta) en índices de franja. */
  meetingSlots: [number, number][];
  week: { sleepMin: number[]; commits: number[]; mood: number[] }; // lu..hoy
  isExample: boolean;
};

export const MEETING_SLOTS_PER_DAY = 27; // 09 → 18 en franjas de 20 min

// ponytail: día de ejemplo hasta que Joaco ingeste github/linear/calendar en raw_events; misma forma.
export function getWorkDay(): WorkDay {
  return {
    log: [
      { type: "commit", time: "14:02", message: "feat: scaffold base", additions: 412, deletions: 0 },
      { type: "commit", time: "12:30", message: "docs: CLAUDE.md", additions: 88, deletions: 0 },
      { type: "pr", title: "PR #3 mergeado · 1 review" },
      { type: "commit", time: "11:15", message: "fix: cookie usuario", additions: 6, deletions: 2 },
      { type: "commit", time: "10:40", message: "chore: shadcn init", additions: 903, deletions: 0 },
    ],
    commits: 9,
    meetingSlots: [[3, 6], [18, 20]],
    week: {
      sleepMin: [402, 431, 352, 470, 410, 440, 432],
      commits: [6, 5, 3, 11, 4, 7, 9],
      mood: [3, 3, 2, 5, 3, 4, 4],
    },
    isExample: true,
  };
}

export function meetingMinutes(slots: readonly [number, number][]): number {
  return slots.reduce((sum, [a, b]) => sum + (b - a) * 20, 0);
}
