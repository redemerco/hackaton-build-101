import { EmptyState } from "@/components/empty-state";
import { PageHeader } from "@/components/page-header";

// Placeholder: lo reemplaza Joaco con GitHub, Linear, Calendar y el digest.
export default function TrabajoPage() {
  return (
    <>
      <PageHeader title="Trabajo" subtitle="Commits, PRs, issues y reuniones." />
      <EmptyState title="Próximamente" description="Tu semana de laburo cruzada con tu cuerpo." />
    </>
  );
}
