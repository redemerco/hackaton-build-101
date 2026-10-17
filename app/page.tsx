import { Pulse } from "@/components/ascii/ascii-field";
import { Count, DurationCount } from "@/components/ascii/count";
import { StreamText } from "@/components/ascii/stream-text";
import { EmptyState } from "@/components/empty-state";
import { Panel } from "@/components/glass/panel";
import { PageHeader } from "@/components/page-header";
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

  // Sin ningún dato real: estado vacío honesto, pero el check-in de ánimo sigue disponible (es un dato que se crea acá).
  if (today.isEmpty) {
    return (
      <Screen>
        <Pulse bpm={60} stress={0.2} />
        <PageHeader title={`Hola, ${user.name}`} subtitle="Pulso cruza tu cuerpo con tu trabajo." />
        <EmptyState
          art="(._.)"
          title="Todavía no hay datos tuyos"
          description="Conectá Google Health, GitHub, Slack o Calendar en Ajustes para ver tu día. Mientras tanto, podés registrar tu ánimo."
        />
        <div className="grid grid-cols-3 gap-2">
          <div className="col-span-2" />
          <MoodCheckin mood={today.mood} />
        </div>
      </Screen>
    );
  }

  const input = daemonInput(today, user.id);
  const state = deriveState(input);
  const spec = STATES[state];
  const nudge = getNudge(user.id);

  return (
    <Screen>
      <Pulse bpm={today.restingBpm ?? 60} stress={stressOf(today)} />
      <h1 className="sr-only">Yo, {user.name}</h1>

      <Panel className="gap-4">
        <div className="grid grid-cols-[auto_1fr] items-center gap-3">
          <Daemon state={state} buddy={buddy} bpm={today.restingBpm ?? 60} isInteractive className="-my-2 -ml-2" />
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
        {today.sleepMin !== null ? (
          <StatCard label="sueño" value={<DurationCount minutes={today.sleepMin} />} hint={<span role="img" aria-label={`sueño de la semana: ${today.sleepWeek.map(formatDuration).join(", ")}`} className="text-sleep">{sparkline(today.sleepWeek)}</span>} />
        ) : (
          <StatCard label="sueño" value={<span className="text-dim">—</span>} hint={<span className="text-dim">sin wearable</span>} />
        )}
        {today.restingBpm !== null ? (
          <StatCard
            label="pulso"
            value={<Count value={today.restingBpm} />}
            hint={<span className="text-heart"><span className="inline-block [animation:beat_var(--beat,1s)_infinite]">♥</span> bpm</span>}
          />
        ) : (
          <StatCard label="pulso" value={<span className="text-dim">—</span>} hint={<span className="text-dim">sin wearable</span>} />
        )}
        <MoodCheckin mood={today.mood} />
      </div>

      {nudge && <NudgeBanner text={nudge.body} />}

      {today.insight && (
        <Panel label="observación" meta="gemini">
          <StreamText fallback={[today.insight]} tokenMs={45} className="text-[15px] leading-relaxed" />
        </Panel>
      )}
    </Screen>
  );
}
