import { Pulse } from "@/components/ascii/ascii-field";
import { Count, DurationCount } from "@/components/ascii/count";
import { Mascot } from "@/components/ascii/mascot";
import { StreamText } from "@/components/ascii/stream-text";
import { Panel } from "@/components/glass/panel";
import { MoodCheckin } from "@/components/mood-checkin";
import { NudgeBanner } from "@/components/nudge-banner";
import { Screen } from "@/components/screen";
import { StatCard } from "@/components/stat-card";
import { formatDuration, sparkline } from "@/lib/ascii";
import { contributors, dayBand, getToday, logLine, mascotMood, stressOf, type Contributor } from "@/lib/today";
import { getCurrentUser } from "@/lib/users";

// ponytail: nudge fijo de ejemplo; Joaco lo reemplaza por el que calcula de calendar + actividad.
const EXAMPLE_NUDGE = "Llevás 3h sin moverte ▁▁▁▁▁▁ y tenés 40 min libres antes de la daily. Caminá un rato.";

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
  const user = await getCurrentUser();
  const today = getToday(user.id);
  const log = logLine(today, formatDuration(today.sleepMin));
  const band = dayBand(today);

  return (
    <Screen>
      <Pulse bpm={today.restingBpm} stress={stressOf(today)} />
      <h1 className="sr-only">Hoy, {user.name}</h1>

      <Panel className="gap-4">
        <div className="grid grid-cols-[auto_1fr] items-center gap-4">
          <Mascot mood={mascotMood(today)} size="lg" />
          <div className="grid gap-1.5">
            <p className="font-pixel text-[22px] leading-none" style={{ color: `var(--${band.tone})` }}>{band.label}</p>
            <p className="font-mono text-[13px] leading-snug text-foreground/90">
              <span className={log.tag === "warn" ? "text-heart" : "text-mood"}>[{log.tag}]</span> {log.text}
            </p>
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
          hint={<span className="text-heart"><span className="inline-block [animation:beat_var(--beat,1s)_infinite]">♥</span> {today.hrvMs}ms</span>}
        />
        <MoodCheckin mood={today.mood} />
      </div>

      <NudgeBanner text={EXAMPLE_NUDGE} />

      <Panel label="observación" meta={today.isExample ? "[ejemplo]" : "gemini"}>
        <StreamText fallback={[today.insight]} tokenMs={45} className="text-[15px] leading-relaxed" />
      </Panel>
    </Screen>
  );
}
