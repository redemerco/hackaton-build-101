import { Pulse } from "@/components/ascii/ascii-field";
import { Digest } from "@/components/digest";
import { PageHeader } from "@/components/page-header";
import { Screen } from "@/components/screen";
import { EXAMPLE_DIGEST } from "@/lib/week";

export default function SemanaPage() {
  return (
    <Screen>
      <Pulse bpm={60} stress={0.3} />
      <PageHeader title="Semana" subtitle="Lo que tu semana de trabajo le hizo a tu cuerpo." />
      <Digest fallback={EXAMPLE_DIGEST} isExample />
    </Screen>
  );
}
