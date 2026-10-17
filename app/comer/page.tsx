import { Pulse } from "@/components/ascii/ascii-field";
import { EmptyState } from "@/components/empty-state";
import { Panel } from "@/components/glass/panel";
import { MealCamera } from "@/components/meal-camera";
import { PageHeader } from "@/components/page-header";
import { Screen } from "@/components/screen";
import { formatRange, totalKcal } from "@/lib/meals";
import { getMealsToday } from "@/lib/meals-data";
import { getCurrentUser } from "@/lib/users";

const PLATE_ART = `   .-~~~~~~~-.
 .'  ~  ~  ~  '.
:   (  )   ==   :
 '.   ~~~~~   .'
   '-._____.-'`;

export default async function ComerPage() {
  const user = await getCurrentUser();
  const meals = getMealsToday(user.id);

  return (
    <Screen>
      <Pulse bpm={62} stress={0.3} />
      <PageHeader title="Comer" subtitle="Sacale una foto. La IA estima en rangos, no en números exactos." />

      <Panel className="justify-items-center gap-5 py-7">
        <pre aria-hidden className="idle-bob m-0 font-pixel text-[11px] leading-[1.15] text-food">{PLATE_ART}</pre>
        <MealCamera />
        <p className="text-sm text-dim">foto → gramos y kcal por ítem</p>
      </Panel>

      {meals.length > 0 ? (
        <Panel label="hoy" meta={<span className="text-food">{formatRange(totalKcal(meals))} kcal</span>}>
          <ul className="grid gap-3">
            {meals.map((m) => (
              <li key={m.time} className="grid grid-cols-[48px_1fr_auto] items-baseline gap-2 text-[15px]">
                <span className="font-mono text-[13px] text-dim">{m.time}</span>
                <span className="truncate">{m.title}</span>
                <span className="font-mono text-[13px] tabular-nums text-food">{formatRange(m.kcal)}</span>
              </li>
            ))}
          </ul>
        </Panel>
      ) : (
        <EmptyState
          art="(  )"
          title="Todavía no anotaste comidas hoy"
          description="Sacale una foto a tu próxima comida y la IA estima gramos y calorías por ítem."
        />
      )}
    </Screen>
  );
}
