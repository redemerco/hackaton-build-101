import { Pulse } from "@/components/ascii/ascii-field";
import { Count, DurationCount } from "@/components/ascii/count";
import { StreamText } from "@/components/ascii/stream-text";
import { Panel } from "@/components/glass/panel";
import { Daemon } from "@/components/daemon/daemon";
import { DaemonSpeech } from "@/components/daemon/daemon-speech";
import { MoodCheckin } from "@/components/mood-checkin";
import { NudgeBanner } from "@/components/nudge-banner";
import { Screen } from "@/components/screen";
import { StatCard } from "@/components/stat-card";
import { formatDuration, sparkline } from "@/lib/ascii";
import { deriveState, linesFor, STATES } from "@/lib/daemon";
import { contributors, daemonInput, getToday, stressOf, type Contributor } from "@/lib/today";
import { getBuddy } from "@/lib/buddy";
import { getNudge } from "@/lib/nudge";
import { getCurrentUser } from "@/lib/users";


const TREND_GLYPH: Record<Contributor["trend"], string> = { up: "▲", down: "▼", flat: "■" };

function ContributorRow({ c }: { c: Contributor }) {
  return (
    <li className="grid grid-cols-[84px_auto_1fr] items-baseline gap-2 font-mono text-[13px]">
      <span className="text-dim">{c.label}</span>
      <span className="tabular-nums">
        <span aria-hidden className={`mr-1.5 text-[10px] ${c.isGood ? "text-work" : "text-heart"}`}>{TREND_GLYPH[c.trend]}</span>
        {c.value}
      </span>
      <span className="truncate text-right text-xs text-dim">{c.vs}</span>
    </li>
  );
}

export default async function Hoy() {
  const [user, buddy] = await Promise.all([getCurrentUser(), getBuddy()]);
  const today = getToday(user.id);
  const input = daemonInput(today, user.id);
  const state = deriveState(input);
  const spec = STATES[state];

  return (
    <Screen>
      <Pulse bpm={today.restingBpm} stress={stressOf(today)} />
      <h1 className="sr-only">Hoy, {user.name}</h1>

      <Panel className="gap-4">
        <div className="grid grid-cols-[auto_1fr] items-center gap-3">
          <Daemon state={state} buddy={buddy} bpm={today.restingBpm} isInteractive className="-my-2 -ml-2" />
          <div className="grid min-w-0 gap-2">
            <p className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
              <span className="font-pixel text-[22px] leading-none" style={{ color: `var(--${spec.tone})` }}>{spec.title}</span>
              <span className="rounded-full bg-white/[.07] px-2 py-0.5 font-mono text-[11px] text-dim">● {spec.process}</span>
            </p>
            <DaemonSpeech lines={linesFor(state, input)} tone={spec.tone} />
          </div>
        </div>
        <ul aria-label="Por qué" className="grid gap-2 border-t border-white/10 pt-3">
          {contributors(today).map((c) => <ContributorRow key={c.label} c={c} />)}
        </ul>
      </Panel>

      <div className="grid grid-cols-3 gap-2">
        <StatCard label="sueño" value={<DurationCount minutes={today.sleepMin} />} hint={<span role="img" aria-label={`sueño de la semana: ${today.sleepWeek.map(formatDuration).join(", ")}`} className="text-sleep">{sparkline(today.sleepWeek)}</span>} />
        <StatCard
          label="pulso"
          value={<Count value={today.restingBpm} />}
          hint={<span className="text-heart"><span className="inline-block [animation:beat_var(--beat,1s)_infinite]">♥</span> bpm</span>}
        />
        <MoodCheckin mood={today.mood} />
      </div>

      <NudgeBanner text={getNudge(user.id).body} />

      <Panel label="observación" meta={today.isExample ? "[ejemplo]" : "gemini"}>
        <StreamText fallback={[today.insight]} tokenMs={45} className="text-[15px] leading-relaxed" />
      </Panel>
    </Screen>
  );
}
