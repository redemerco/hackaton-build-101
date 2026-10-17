import { Pulse } from "@/components/ascii/ascii-field";
import { Mascot } from "@/components/ascii/mascot";
import { Caret } from "@/components/ascii/spinner";
import { Panel } from "@/components/glass/panel";
import { MoodCheckin } from "@/components/mood-checkin";
import { NudgeBanner } from "@/components/nudge-banner";
import { StatCard } from "@/components/stat-card";
import { formatDuration, sparkline } from "@/lib/ascii";
import { getToday, logLine, mascotMood, stressOf } from "@/lib/today";
import { getCurrentUser } from "@/lib/users";

// ponytail: nudge fijo de ejemplo; Joaco lo reemplaza por el que calcula de calendar + actividad.
const EXAMPLE_NUDGE = "Llevás 3h sin moverte ▁▁▁▁▁▁ y tenés 40 min libres antes de la daily. Caminá un rato.";

export default async function Hoy() {
  const user = await getCurrentUser();
  const today = getToday(user.id);
  const sleep = formatDuration(today.sleepMin);
  const log = logLine(today, sleep);

  return (
    <>
      <Pulse bpm={today.restingBpm} stress={stressOf(today)} />
      <h1 className="sr-only">Hoy, {user.name}</h1>

      <Panel className="grid-cols-[auto_1fr] items-center gap-3">
        <Mascot mood={mascotMood(today)} />
        <p className="font-mono text-[11.5px] leading-snug text-foreground/85">
          <span className={log.tag === "warn" ? "text-heart" : "text-mood"}>[{log.tag}]</span> {log.text}
        </p>
      </Panel>

      <div className="grid grid-cols-3 gap-2">
        <StatCard label="sueño" value={sleep} hint={<span className="text-sleep">{sparkline(today.sleepWeek)}</span>} />
        <StatCard
          label="pulso"
          value={<>{today.restingBpm}<span className="ml-0.5 text-[10px] font-normal text-dim">bpm</span></>}
          hint={<span className="text-heart"><span className="inline-block [animation:beat_var(--beat,1s)_infinite]">♥</span> hrv {today.hrvMs}ms</span>}
        />
        <MoodCheckin mood={today.mood} />
      </div>

      <NudgeBanner text={EXAMPLE_NUDGE} />

      <Panel label="observación" meta={today.isExample ? "[ejemplo]" : "gemini"}>
        <p className="text-[13.5px] leading-relaxed">
          {today.insight}
          <Caret />
        </p>
      </Panel>
    </>
  );
}
