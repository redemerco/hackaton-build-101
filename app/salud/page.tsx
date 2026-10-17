import { Pulse } from "@/components/ascii/ascii-field";
import { Count, DurationCount } from "@/components/ascii/count";
import { Hypnogram } from "@/components/ascii/hypnogram";
import { EmptyState } from "@/components/empty-state";
import { PageHeader } from "@/components/page-header";
import { Panel } from "@/components/glass/panel";
import { Screen } from "@/components/screen";
import { MealCamera } from "@/components/meal-camera";
import { asciiLine, fitMonoFontSize, formatDuration, sparkline } from "@/lib/ascii";
import { getLastNight, getMealsToday, minutesByStage } from "@/lib/body";
import { EXAMPLE_MEALS_TODAY, formatRange, totalKcal } from "@/lib/meals";
import { getCurrentUser } from "@/lib/users";

const STEPS_TRACKING_EM = 0.35;
const PLATE_ART = `   .-~~~~~~~-.
 .'  ~  ~  ~  '.
:   (  )   ==   :
 '.   ~~~~~   .'
   '-._____.-'`;

/** Comidas: la cámara (Gemini vision) y lo que comiste hoy. Antes era la pestaña Comer. */
function FoodPanels({ userId }: { userId: string }) {
  const saved = getMealsToday(userId);
  const meals = saved.length ? saved : EXAMPLE_MEALS_TODAY;
  return (
    <>
      <Panel label="comida">
        <div className="grid justify-items-center gap-4 py-3">
          <pre aria-hidden className="idle-bob m-0 font-pixel text-[11px] leading-[1.15] text-food">{PLATE_ART}</pre>
          <MealCamera />
          <p className="text-sm text-dim">foto → gramos y kcal por ítem, en rangos</p>
        </div>
      </Panel>
      <Panel label="comidas de hoy" meta={<span className="text-food">{formatRange(totalKcal(meals))} kcal</span>}>
        <ul className="grid gap-3">
          {meals.map((m) => (
            <li key={m.time + m.title} className="grid grid-cols-[48px_1fr_auto] items-baseline gap-2 text-[15px]">
              <span className="font-mono text-[13px] text-dim">{m.time}</span>
              <span className="truncate">{m.title}</span>
              <span className="font-mono text-[13px] tabular-nums text-food">{formatRange(m.kcal)}</span>
            </li>
          ))}
        </ul>
        {!saved.length && <p className="font-mono text-xs text-faint">[ejemplo] hasta que guardes tu primera comida</p>}
      </Panel>
    </>
  );
}

export default async function SaludPage() {
  const user = await getCurrentUser();
  if (!user.hasWearable) {
    return (
      <Screen>
        <PageHeader title="Salud" subtitle="Funciona sin wearable." />
        <FoodPanels userId={user.id} />
        <EmptyState
          art="(•_•)"
          title="Sin wearable, igual te leemos"
          description="Tus comidas y tu ánimo alcanzan para cruzarlos con tu semana de trabajo."
        />
      </Screen>
    );
  }

  const night = getLastNight(user.id);
  if (!night) {
    return (
      <Screen>
        <PageHeader title="Cuerpo" subtitle="Conectá tu wearable para ver tu sueño." />
        <EmptyState
          art="(-_-) zzz"
          title="Todavía no hay noches registradas"
          description="Conectá Google Health en Ajustes para ver tu sueño, tu pulso y tu HRV de anoche."
        />
      </Screen>
    );
  }

  const byStage = night.stageMinutes ?? minutesByStage(night.stages);
  const asleep = byStage.light + byStage.deep + byStage.rem;
  const steps = night.stepsByHour.reduce((a, b) => a + b, 0);
  const hasHr = night.hrNight.length > 0;
  const minBpm = hasHr ? Math.min(...night.hrNight) : null;
  const [h0, m0] = night.start.split(":").map(Number);
  const minAt = hasHr && minBpm !== null ? h0 * 60 + m0 + Math.round((night.hrNight.indexOf(minBpm) / (night.hrNight.length - 1)) * asleep) : null;
  const minAtText = minAt !== null ? `${String(Math.floor(minAt / 60) % 24).padStart(2, "0")}:${String(minAt % 60).padStart(2, "0")}` : "";

  return (
    <Screen>
<<<<<<< Updated upstream:app/salud/page.tsx
      <Pulse bpm={night.restingBpm} stress={0.2} />
      <PageHeader title="Salud" subtitle={night.isExample ? "[ejemplo] hasta conectar Google Health" : "Google Health"} />
=======
      <Pulse bpm={night.restingBpm ?? 60} stress={0.2} />
      <PageHeader title="Cuerpo" subtitle="Google Health" />
>>>>>>> Stashed changes:app/cuerpo/page.tsx

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
          {byStage.awake > 0 && <span className="text-[#ff9b8f]">█ despierto {formatDuration(byStage.awake)}</span>}
        </p>
      </Panel>

<<<<<<< Updated upstream:app/salud/page.tsx
      <FoodPanels userId={user.id} />

      <Panel
        label="pulso · noche"
        meta={<span className="text-heart"><span className="inline-block [animation:beat_var(--beat,1s)_infinite]">♥</span> {night.restingBpm} reposo</span>}
      >
        <div className="@container">
          <pre aria-hidden className="m-0 font-mono leading-none text-heart" style={{ fontSize: fitMonoFontSize(night.hrNight.length, 20) }}>
            {asciiLine(night.hrNight, 5)}
          </pre>
        </div>
        <dl className="grid grid-cols-[auto_auto_1fr] gap-x-3 gap-y-1 font-mono text-[13px] tabular-nums">
          <dt className="text-dim">reposo</dt><dd className="font-semibold"><Count value={night.restingBpm} /> bpm</dd>
          <dd className="text-right text-xs text-dim">típico {night.restingTypical[0]}–{night.restingTypical[1]}</dd>
          <dt className="text-dim">hrv</dt><dd className="font-semibold"><Count value={night.hrvMs} /> ms</dd>
          <dd className="text-right text-xs text-dim">típico {night.hrvTypical[0]}–{night.hrvTypical[1]}</dd>
          <dt className="text-dim">mínimo</dt><dd className="font-semibold"><Count value={Math.round(minBpm)} /> bpm</dd>
          <dd className="text-right text-xs text-dim">a las {minAtText}</dd>
        </dl>
      </Panel>
=======
      {hasHr && night.restingBpm !== null ? (
        <Panel
          label="pulso · noche"
          meta={<span className="text-heart"><span className="inline-block [animation:beat_var(--beat,1s)_infinite]">♥</span> {night.restingBpm} reposo</span>}
        >
          <div className="@container">
            <pre aria-hidden className="m-0 font-mono leading-none text-heart" style={{ fontSize: fitMonoFontSize(night.hrNight.length, 20) }}>
              {asciiLine(night.hrNight, 5)}
            </pre>
          </div>
          <dl className="grid grid-cols-[auto_auto_1fr] gap-x-3 gap-y-1 font-mono text-[13px] tabular-nums">
            <dt className="text-dim">reposo</dt><dd className="font-semibold"><Count value={night.restingBpm} /> bpm</dd>
            <dd className="text-right text-xs text-dim">{night.restingTypical ? `típico ${night.restingTypical[0]}–${night.restingTypical[1]}` : ""}</dd>
            {night.hrvMs !== null && (
              <>
                <dt className="text-dim">hrv</dt><dd className="font-semibold"><Count value={night.hrvMs} /> ms</dd>
                <dd className="text-right text-xs text-dim">{night.hrvTypical ? `típico ${night.hrvTypical[0]}–${night.hrvTypical[1]}` : ""}</dd>
              </>
            )}
            {minBpm !== null && (
              <>
                <dt className="text-dim">mínimo</dt><dd className="font-semibold"><Count value={Math.round(minBpm)} /> bpm</dd>
                <dd className="text-right text-xs text-dim">a las {minAtText}</dd>
              </>
            )}
          </dl>
        </Panel>
      ) : (
        <Panel label="pulso · noche" meta="sin dato">
          <p className="text-[15px] text-dim">Google Health no mandó pulso ni HRV para esta noche todavía.</p>
        </Panel>
      )}
>>>>>>> Stashed changes:app/cuerpo/page.tsx

      {steps > 0 && (
        <Panel label="pasos · 08 → 19 h" meta={<Count value={steps} />}>
          <div aria-hidden className="@container">
            <p
              className="font-mono leading-none text-work"
              style={{ fontSize: fitMonoFontSize(night.stepsByHour.length, 32, STEPS_TRACKING_EM), letterSpacing: `${STEPS_TRACKING_EM}em` }}
            >
              {sparkline(night.stepsByHour)}
            </p>
            <p className="mt-1.5 flex justify-between font-mono text-[11px] tabular-nums text-faint">
              <span>08</span><span>19</span>
            </p>
          </div>
        </Panel>
      )}
    </Screen>
  );
}
