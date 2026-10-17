import { Pulse } from "@/components/ascii/ascii-field";
import { Count, DurationCount } from "@/components/ascii/count";
import { Hypnogram } from "@/components/ascii/hypnogram";
import { EmptyState } from "@/components/empty-state";
import { PageHeader } from "@/components/page-header";
import { Panel } from "@/components/glass/panel";
import { Screen } from "@/components/screen";
import { asciiLine, formatDuration, sparkline } from "@/lib/ascii";
import { getLastNight, minutesByStage } from "@/lib/body";
import { getCurrentUser } from "@/lib/users";

export default async function CuerpoPage() {
  const user = await getCurrentUser();
  if (!user.hasWearable) {
    return (
      <Screen>
        <PageHeader title="Cuerpo" subtitle="Funciona sin wearable." />
        <EmptyState
          art="(•_•)"
          title="Sin wearable, igual te leemos"
          description="Tus comidas y tu ánimo alcanzan para cruzarlos con tu semana de trabajo."
        />
      </Screen>
    );
  }

  const night = getLastNight(user.id);
  const byStage = night.stageMinutes ?? minutesByStage(night.stages);
  const asleep = byStage.light + byStage.deep + byStage.rem;
  const steps = night.stepsByHour.reduce((a, b) => a + b, 0);
  const minBpm = Math.min(...night.hrNight);
  const [h0, m0] = night.start.split(":").map(Number);
  const minAt = h0 * 60 + m0 + Math.round((night.hrNight.indexOf(minBpm) / (night.hrNight.length - 1)) * asleep);
  const minAtText = `${String(Math.floor(minAt / 60) % 24).padStart(2, "0")}:${String(minAt % 60).padStart(2, "0")}`;

  return (
    <Screen>
      <Pulse bpm={night.restingBpm} stress={0.2} />
      <PageHeader title="Cuerpo" subtitle={night.isExample ? "[ejemplo] hasta conectar Google Health" : "Google Health"} />

      <Panel label="sueño · anoche" meta={`${night.start} → ${night.end}`}>
        <p className="font-mono text-[28px] font-semibold leading-none tracking-tight">
          <DurationCount minutes={asleep} />
          <span className="ml-1.5 text-sm font-normal tracking-normal text-dim">dormido</span>
        </p>
        <Hypnogram stages={night.stages} startHour={night.startHour} />
        <p className="flex flex-wrap gap-x-4 gap-y-1 font-mono text-xs tabular-nums text-dim">
          <span className="text-sleep">█ profundo {formatDuration(byStage.deep)}</span>
          <span className="text-[#c9a7ff]">█ rem {formatDuration(byStage.rem)}</span>
          <span className="text-[#6f7bd9]">█ liviano {formatDuration(byStage.light)}</span>
        </p>
      </Panel>

      <Panel
        label="pulso · noche"
        meta={<span className="text-heart"><span className="inline-block [animation:beat_var(--beat,1s)_infinite]">♥</span> {night.restingBpm} reposo</span>}
      >
        <pre aria-hidden className="m-0 font-mono text-xs leading-3 text-heart">{asciiLine(night.hrNight, 5)}</pre>
        <dl className="grid grid-cols-[auto_auto_1fr] gap-x-3 gap-y-1 font-mono text-[13px] tabular-nums">
          <dt className="text-dim">reposo</dt><dd className="font-semibold"><Count value={night.restingBpm} /> bpm</dd>
          <dd className="text-right text-xs text-dim">típico {night.restingTypical[0]}–{night.restingTypical[1]}</dd>
          <dt className="text-dim">hrv</dt><dd className="font-semibold"><Count value={night.hrvMs} /> ms</dd>
          <dd className="text-right text-xs text-dim">típico {night.hrvTypical[0]}–{night.hrvTypical[1]}</dd>
          <dt className="text-dim">mínimo</dt><dd className="font-semibold"><Count value={Math.round(minBpm)} /> bpm</dd>
          <dd className="text-right text-xs text-dim">a las {minAtText}</dd>
        </dl>
      </Panel>

      <Panel label="pasos · 08 → 19 h" meta={<Count value={steps} />}>
        <p aria-hidden className="font-mono text-xl tracking-[2px] text-work">{sparkline(night.stepsByHour)}</p>
      </Panel>
    </Screen>
  );
}
