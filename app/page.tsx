import { PageHeader } from "@/components/page-header";
import { PushToggle } from "@/components/push-toggle";
import { StatCard } from "@/components/stat-card";
import { getCurrentUser } from "@/lib/users";

export default async function Home() {
  const user = await getCurrentUser();
  return (
    <>
      <PageHeader title={`Hola, ${user.name}`} subtitle="Tu cuerpo y tu trabajo, en el mismo gráfico." />
      <div className="grid grid-cols-2 gap-3">
        <StatCard label="Sueño" value="—" hint={user.hasWearable ? "Esperando Google Health" : "Sin wearable"} />
        <StatCard label="Ánimo" value="—" hint="Check-in de hoy" />
      </div>
      <section className="mt-6 flex flex-col gap-2">
        <h2 className="text-sm font-medium text-muted-foreground">Notificaciones</h2>
        <PushToggle />
      </section>
    </>
  );
}
