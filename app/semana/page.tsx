import { EmptyState } from "@/components/empty-state";
import { PageHeader } from "@/components/page-header";

// Placeholder: lo reemplaza Joaco con el digest en streaming y el Wrapped.
export default function SemanaPage() {
  return (
    <>
      <PageHeader title="Semana" subtitle="Tu digest y el Wrapped." />
      <EmptyState art="(-_-)" title="Próximamente" description="La IA te cuenta tu semana: sueño, commits, reuniones y ánimo." />
    </>
  );
}
