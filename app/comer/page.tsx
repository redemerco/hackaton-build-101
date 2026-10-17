import { Pulse } from "@/components/ascii/ascii-field";
import { Panel } from "@/components/glass/panel";
import { MealCamera } from "@/components/meal-camera";
import { PageHeader } from "@/components/page-header";
import { EXAMPLE_MEALS_TODAY, formatRange, totalKcal } from "@/lib/meals";

const PLATE_ART = `   .-~~~~~~~-.
 .'  ~  ~  ~  '.
:   (  )   ==   :
 '.   ~~~~~   .'
   '-._____.-'`;

export default function ComerPage() {
  const meals = EXAMPLE_MEALS_TODAY;
  const total = totalKcal(meals);

  return (
    <>
      <Pulse bpm={62} stress={0.3} />
      <PageHeader title="Comer" subtitle="Sacale una foto. La IA estima en rangos, no en números exactos." />

      <Panel className="justify-items-center gap-4 py-6">
        <pre aria-hidden className="m-0 font-pixel text-[11px] leading-[1.15] text-food">{PLATE_ART}</pre>
        <MealCamera />
        <p className="text-xs text-dim">foto → gramos y kcal por ítem</p>
      </Panel>

      <Panel label="hoy" meta={<span className="tabular-nums text-food">{formatRange(total)} kcal</span>}>
        <ul className="grid gap-2">
          {meals.map((m) => (
            <li key={m.time} className="grid grid-cols-[44px_1fr_auto] items-baseline gap-2 text-[13px]">
              <span className="font-mono text-[11px] text-dim">{m.time}</span>
              <span className="truncate">{m.title}</span>
              <span className="font-mono text-xs tabular-nums text-food">{formatRange(m.kcal)}</span>
            </li>
          ))}
        </ul>
        <p className="font-mono text-[10.5px] text-faint">[ejemplo] hasta que se guarden comidas reales</p>
      </Panel>
    </>
  );
}
