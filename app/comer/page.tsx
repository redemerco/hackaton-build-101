import { EmptyState } from "@/components/empty-state";
import { PageHeader } from "@/components/page-header";

// Placeholder: lo reemplaza Renzo con la cámara + análisis.
export default function ComerPage() {
  return (
    <>
      <PageHeader title="Comidas" subtitle="Sacale una foto, Claude hace el resto." />
      <EmptyState title="Próximamente" description="Foto → calorías y macros en rangos." />
    </>
  );
}
