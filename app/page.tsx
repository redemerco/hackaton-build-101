import { AgentActions } from "@/components/agent-actions";
import { Pulse } from "@/components/ascii/ascii-field";
import { Count, DurationCount } from "@/components/ascii/count";
import { CrossChart } from "@/components/cross-chart";
import { EmptyState } from "@/components/empty-state";
import { Panel } from "@/components/glass/panel";
import { PageHeader } from "@/components/page-header";
import { Daemon } from "@/components/daemon/daemon";
import { DaemonSpeech } from "@/components/daemon/daemon-speech";
import { MoodCheckin } from "@/components/mood-checkin";
import { Screen } from "@/components/screen";
import { SlackReport } from "@/components/slack-report";
import { StatCard } from "@/components/stat-card";
import { Summary } from "@/components/summary";
import { formatDuration, sparkline } from "@/lib/ascii";
import { deriveState, linesFor, STATES } from "@/lib/daemon";
import { contributors, daemonInput, getToday, stressOf, type Contributor } from "@/lib/today";
import { getBuddy } from "@/lib/buddy";
import { getCross } from "@/lib/cross";
import { canSendToSlack, hasSimulatedData } from "@/lib/report";
import type { Detail, Insight, Pending } from "@/lib/insights";
import { buildMePrompt, meFallback } from "@/lib/summary-me";
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

// bedMinute viene en minutos desde las 18:00 de la víspera
const fromSix = (m: number) => {
  const t = (Math.round(m) + 18 * 60) % (24 * 60);
  return `${String(Math.floor(t / 60)).padStart(2, "0")}:${String(t % 60).padStart(2, "0")}`;
};
const FMT: Record<Detail["unit"], (v: number) => string> = { min: (v) => formatDuration(Math.round(v)), ánimo: (v) => String(v), hora: fromSix };

function DetailRows({ d }: { d: Detail }) {
  const row = (label: string, values: number[]) => (
    <p className="grid gap-0.5">
      <span className="text-dim">{label} ({values.length})</span>
      <span className="flex flex-wrap gap-x-2 text-foreground/80">
        {values.map((v, k) => <span key={k} className="whitespace-nowrap tabular-nums">{FMT[d.unit](v)}</span>)}
      </span>
    </p>
  );
  return (
    <details className="group font-mono text-[11px] leading-relaxed">
      <summary className="cursor-pointer list-none text-faint group-open:text-dim">ver los días ▾</summary>
      <div className="mt-1.5 grid gap-1.5">
        {row(d.aLabel, d.a)}
        {row(d.bLabel, d.b)}
      </div>
    </details>
  );
}

function InsightRow({ i }: { i: Insight }) {
  return (
    <li className="grid gap-1 border-t border-white/10 pt-3 first:border-t-0 first:pt-0">
      <p className="text-[13px] font-medium text-dim">{i.question}</p>
      <p className="text-[15px] leading-relaxed text-pretty">{i.text}</p>
      <p className="text-[13px] leading-snug text-mood/90">→ {i.tryThis}</p>
      <p className="font-mono text-[12px] text-faint">
        {i.basis} · {i.isHypothesis ? <span className="text-mood">{i.evidence}</span> : i.evidence}
      </p>
      {i.detail && <DetailRows d={i.detail} />}
    </li>
  );
}

function PendingRow({ p }: { p: Pending }) {
  return (
    <li className="grid gap-0.5">
      <span className="text-[13px] text-dim">{p.question}</span>
      <span className="font-mono text-[12px] text-faint">{p.need}</span>
    </li>
  );
}

const MAX_INSIGHTS = 4;
const MAX_PENDING = 4;

export default async function Yo() {
  const [user, buddy] = await Promise.all([getCurrentUser(), getBuddy()]);
  const cross = getCross(user.id);
  const isSimulated = hasSimulatedData(user.id);
  const today = getToday(user.id, new Date(), cross.series);
  const hasWork = cross.series.some((d) => d.commits > 0 || d.lastWorkMinute !== null || d.meetingMin > 0);

  // Sin ningún dato real: estado vacío honesto, pero el check-in de ánimo sigue disponible (es un dato que se crea acá).
  if (today.isEmpty && !hasWork) {
    return (
      <Screen>
        <Pulse bpm={60} stress={0.2} />
        <PageHeader title={`Hola, ${user.name}`} subtitle="build101 cruza tu cuerpo con tu trabajo." />
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

      <Panel label="tu día · por hora" meta={isSimulated ? "[datos simulados]" : "hoy"}>
        <CrossChart day={cross.today} nowHour={cross.nowHour} />
      </Panel>

      <Summary label="hoy, en una" src="/api/summary/me" counts={buildMePrompt(user.id, today, cross).counts} fallback={meFallback(today, cross)} />

      <SlackReport name={user.name} canSend={canSendToSlack()} />

      <Panel label="cruces con tus datos" meta={`${cross.insights.length} con respaldo${isSimulated ? " · [simulados]" : ""}`}>
        {cross.insights.length > 0 ? (
          <ul className="grid gap-3">
            {cross.insights.slice(0, MAX_INSIGHTS).map((i) => <InsightRow key={i.id} i={i} />)}
          </ul>
        ) : (
          <p className="text-[15px] leading-relaxed text-dim">Todavía no hay suficientes días para afirmar nada. Preferimos no inventar: cada cruce aparece recién cuando tus datos lo sostienen.</p>
        )}
        {cross.pending.length > 0 && (
          <ul className="grid gap-1.5 border-t border-white/10 pt-3" aria-label="Lo demás que miramos">
            <li className="font-mono text-[12px] uppercase tracking-[0.08em] text-faint">lo demás que miramos</li>
            {cross.pending.slice(0, MAX_PENDING).map((p) => <PendingRow key={p.id} p={p} />)}
          </ul>
        )}
      </Panel>

      {/* Acciones del agente (Renzo): mover reuniones, bloquear foco, nudge. */}
      <section id="acciones" className="contents">
        <AgentActions />
      </section>
    </Screen>
  );
}
