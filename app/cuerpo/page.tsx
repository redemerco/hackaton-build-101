import { Pulse } from "@/components/ascii/ascii-field";
import { Hypnogram } from "@/components/ascii/hypnogram";
import { EmptyState } from "@/components/empty-state";
import { PageHeader } from "@/components/page-header";
import { Panel } from "@/components/glass/panel";
import { asciiLine, formatDuration, sparkline } from "@/lib/ascii";
import { getLastNight, minutesByStage } from "@/lib/body";
import { getCurrentUser } from "@/lib/users";

export default async function CuerpoPage() {
  const user = await getCurrentUser();
  if (!user.hasWearable) {
    return (
      <>
        <PageHeader title="Cuerpo" subtitle="Funciona sin wearable." />
        <EmptyState
          art="(•_•)"
          title="Sin wearable, igual te leemos"
          description="Tus comidas y tu ánimo alcanzan para cruzarlos con tu semana de trabajo."
        />
      </>
    );
  }

  const night = getLastNight();
  const byStage = minutesByStage(night.stages);
  const asleep = byStage.light + byStage.deep + byStage.rem;
  const steps = night.stepsByHour.reduce((a, b) => a + b, 0);

  return (
    <>
      <Pulse bpm={night.restingBpm} stress={0.2} />
      <PageHeader title="Cuerpo" subtitle={night.isExample ? "[ejemplo] hasta conectar Google Health" : "Google Health"} />

      <Panel label="sueño · anoche" meta={`${night.start} → ${night.end}`}>
        <p className="font-mono text-[22px] font-semibold tabular-nums tracking-tight">
          {formatDuration(asleep)}
          <span className="ml-1 text-xs font-normal tracking-normal text-dim">dormido</span>
        </p>
        <Hypnogram stages={night.stages} startHour={night.startHour} />
        <p className="flex flex-wrap gap-x-3 font-mono text-[10.5px] tabular-nums text-dim">
          <span className="text-sleep">█ profundo {formatDuration(byStage.deep)}</span>
          <span className="text-[#c9a7ff]">█ rem {formatDuration(byStage.rem)}</span>
          <span className="text-[#6f7bd9]">█ liviano {formatDuration(byStage.light)}</span>
        </p>
      </Panel>

      <Panel
        label="pulso · noche"
        meta={<span className="text-heart"><span className="inline-block [animation:beat_var(--beat,1s)_infinite]">♥</span> {night.restingBpm} reposo</span>}
      >
        <pre aria-hidden className="m-0 font-mono text-[10px] leading-[10px] text-heart">{asciiLine(night.hrNight, 5)}</pre>
        <p className="flex gap-3 font-mono text-[10.5px] tabular-nums text-dim">
          <span>min <b className="text-foreground">{Math.round(Math.min(...night.hrNight))}</b></span>
          <span>hrv <b className="text-foreground">{night.hrvMs}</b> ms</span>
        </p>
      </Panel>

      <Panel label="pasos · 08 → 19 h" meta={<span className="tabular-nums">{steps.toLocaleString("es-AR")}</span>}>
        <p aria-hidden className="font-mono text-[15px] tracking-[1px] text-work">{sparkline(night.stepsByHour)}</p>
      </Panel>
    </>
  );
}
