import { EmptyState } from "@/components/empty-state";
import { PageHeader } from "@/components/page-header";

export default function CuerpoPage() {
  return (
    <>
      <PageHeader title="Cuerpo" subtitle="Sueño, pulso y actividad." />
      <EmptyState title="Todavía no hay datos" description="Aparecen cuando se conecte Google Health." />
    </>
  );
}
