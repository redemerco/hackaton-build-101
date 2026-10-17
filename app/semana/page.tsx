import { Pulse } from "@/components/ascii/ascii-field";
import { Digest } from "@/components/digest";
import { Panel } from "@/components/glass/panel";
import { PageHeader } from "@/components/page-header";
import { Ranking, type RankingEntry } from "@/components/ranking";
import { Screen } from "@/components/screen";
import { getRanking, sortToday, sortWeek, type RankRow } from "@/lib/ranking";
import { getCurrentUser } from "@/lib/users";
import type { StreamPart } from "@/components/ascii/stream-text";

const toEntry = (r: RankRow, score: number | null, note?: string): RankingEntry => ({ userId: r.userId, name: r.name, isMe: r.isMe, ...r.look, score, note });

// Respaldo honesto si el endpoint de digest no responde: no inventa números, dice que no hay digest.
const DIGEST_FALLBACK: readonly StreamPart[] = ["Todavía no hay digest. Conectá tus fuentes en Ajustes para que Pulso cruce tu semana."];

export default async function SemanaPage() {
  const user = await getCurrentUser();
  const ranking = getRanking(user.id);

  return (
    <Screen>
      <Pulse bpm={60} stress={0.3} />
      <PageHeader title="Semana" subtitle="Lo que tu semana de trabajo le hizo a tu cuerpo." />
      <Digest fallback={DIGEST_FALLBACK} src="/api/digest" isExample={false} />
      {ranking.team ? (
        ranking.rows.length > 0 ? (
          <Ranking
            team={ranking.team}
            isExample={ranking.isExample}
            isSimulated={ranking.rows.some((r) => r.isSimulated)}
            today={sortToday(ranking.rows).map((r) => toEntry(r, r.today?.score ?? null, r.today?.isPartial ? "parcial" : undefined))}
            week={sortWeek(ranking.rows).map((r) => toEntry(r, r.week?.score ?? null, r.week ? `${r.week.days}/7 días` : undefined))}
          />
        ) : (
          <Panel label={`ranking · ${ranking.team}`} meta="sin puntajes">
            <p className="text-[15px] leading-relaxed text-foreground/90">
              Todavía nadie de tu workspace tiene puntaje. Conectá tu wearable con Google Health para entrar al ranking.
            </p>
          </Panel>
        )
      ) : (
        <Panel label="ranking del equipo">
          <p className="text-[15px] leading-relaxed text-foreground/90">
            Conectá Slack en Ajustes para entrar al ranking de tu workspace. Solo se comparte tu puntaje, nunca tus datos.
          </p>
        </Panel>
      )}
    </Screen>
  );
}
