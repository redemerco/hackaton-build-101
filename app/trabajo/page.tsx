import { Pulse } from "@/components/ascii/ascii-field";
import { EmptyState } from "@/components/empty-state";
import { Panel } from "@/components/glass/panel";
import { PageHeader } from "@/components/page-header";
import { Screen } from "@/components/screen";
import { formatDuration, sparkline } from "@/lib/ascii";
import { confidenceStars, getWorkDay, MEETING_SLOTS_PER_DAY, meetingSlotsToday, meetingsToday, MIN_DAYS_FOR_CORRELATION, type WorkLogEntry } from "@/lib/work";
import { getConnection } from "@/lib/connections";
import { getCurrentUser } from "@/lib/users";
import { getLinearWeek, getSlackToday, type SlackToday } from "@/lib/work-signals";
import { SourcesList } from "@/components/connect/source-card";
import { getSourcesOverview } from "@/lib/connection-overview";
import { buildWorkPrompt, EXAMPLE_WORK_SUMMARY } from "@/lib/summary-work";
// Plan B: cuando esté components/summary.tsx (Santi), este import pasa a "@/components/summary".
import { Summary } from "./work-summary";

const MESSAGE_WIDTH = 21;

function LogLine({ entry }: { entry: WorkLogEntry }) {
  if (entry.type === "pr") {
    return <><span className="text-work">|</span> <span className="text-dim">◆ {entry.title}</span></>;
  }
  return (
    <>
      <span className="text-work">*</span> <span className="text-dim">{entry.time}</span> {entry.message.padEnd(MESSAGE_WIDTH, " ")}
      {entry.additions > 0 && <span className="text-[#8fe3a2]">+{entry.additions}</span>}
      {entry.additions > 0 && entry.deletions > 0 && " "}
      {entry.deletions > 0 && <span className="text-heart">-{entry.deletions}</span>}
    </>
  );
}

const PROGRESS_CELLS = 10;

/** Honestidad primero: cuántos días hay, qué tanta confianza da, y que correlación no es causa. */
function CorrelationNote({ days }: { days: number }) {
  const filled = Math.min(PROGRESS_CELLS, Math.round((days / MIN_DAYS_FOR_CORRELATION) * PROGRESS_CELLS));
  const stars = confidenceStars(days);
  const hasEnough = days >= MIN_DAYS_FOR_CORRELATION;
  return (
    <div className="grid gap-2 border-t border-white/10 pt-3">
      <p className="flex flex-wrap items-baseline justify-between gap-2 font-mono text-[13px] tabular-nums">
        <span>
          <span aria-hidden className="text-work">{"▓".repeat(filled)}</span>
          <span aria-hidden className="text-white/15">{"░".repeat(PROGRESS_CELLS - filled)}</span>{" "}
          {days} días
        </span>
        {hasEnough && (
          <span role="img" aria-label={`confianza ${stars} de 5`} className="text-mood">
            {"★".repeat(stars)}<span className="text-white/20">{"★".repeat(5 - stars)}</span>
          </span>
        )}
      </p>
      {/* Con datos suficientes no hay oración fija: la lectura del cruce la hace el resumen IA. */}
      {!hasEnough && (
        <p className="text-[15px] leading-relaxed text-foreground/90">
          Todavía no alcanza: hacen falta {MIN_DAYS_FOR_CORRELATION} días para decir algo.
        </p>
      )}
      <p className="text-xs leading-relaxed text-dim">Correlación, no causa: puede ser una cosa sobre la otra, un tercer factor o casualidad.</p>
    </div>
  );
}

/** Sparkline con huecos: los días sin dato (null) van como "·" y no cuentan para la escala. */
function sparkGaps(values: readonly (number | null)[]): string {
  const known = sparkline(values.filter((v): v is number => v !== null));
  let i = 0;
  return values.map((v) => (v === null ? "·" : known[i++])).join("");
}

const HOUR_BLOCKS = "▁▂▃▄▅▆▇█";

/** 24 barras (una por hora); las horas sin mensajes van como punto para que se vea el silencio. */
function hourBars(values: readonly number[]): string {
  const max = Math.max(1, ...values);
  return values.map((v) => (v === 0 ? "·" : HOUR_BLOCKS[Math.min(7, Math.ceil((v / max) * 7))])).join("");
}

function SlackPanel({ s }: { s: SlackToday }) {
  if (!s.hasData) {
    return (
      <Panel label="slack · hoy" meta="sin conectar">
        <p className="text-[15px] text-dim">Conectá Slack en Ajustes: contamos tus mensajes por hora, nunca leemos el contenido.</p>
      </Panel>
    );
  }
  return (
    <Panel label="slack · hoy" meta={`${s.messages} mensajes`}>
      <p className="font-mono text-[13px] tabular-nums text-dim">
        {s.first ? <>primero <b className="text-foreground">{s.first}</b> · último <b className="text-foreground">{s.last}</b></> : "todavía nada hoy"}
      </p>
      <div aria-hidden className="grid gap-0.5 font-mono">
        <pre className="m-0 whitespace-pre text-[13px] tracking-[1px] text-work">{hourBars(s.byHour)}</pre>
        <pre className="m-0 whitespace-pre text-[13px] tracking-[1px] text-faint">{"00    06    12    18   23"}</pre>
      </div>
      <div className="grid grid-cols-[1fr_auto] items-center gap-2 border-t border-white/10 pt-2.5 font-mono text-[13px]">
        <span className="text-dim">fuera de horario · 7 días</span>
        <span role="img" aria-label={`mensajes fuera de horario por día: ${s.afterHoursWeek.join(", ")}`} className="text-lg tracking-[3px] text-heart">
          {sparkline(s.afterHoursWeek)}
        </span>
      </div>
      {s.afterHoursToday > 0 && (
        <p className="text-[15px] leading-relaxed text-foreground/90">Hoy mandaste {s.afterHoursToday} mensajes después de las 20 o antes de las 8.</p>
      )}
    </Panel>
  );
}

export default async function TrabajoPage() {
  const userId = (await getCurrentUser()).id;
  const day = getWorkDay(userId);
  const linear = getLinearWeek(userId);
  const slack = getSlackToday(userId);
  const oauthSources = getSourcesOverview(userId).filter((s) => s.connect === "oauth");
  const hasAnyConnected = oauthSources.some((s) => s.account);
  const hasCalendar = !!getConnection(userId, "calendar");
  const meetings = meetingsToday(userId);

  // Sin GitHub, Linear, Slack ni Calendar: estado vacío honesto, con el panel de fuentes para conectar.
  if (!day && !linear.hasData && !slack.hasData && !hasCalendar && meetings.length === 0) {
    return (
      <Screen>
        <Pulse bpm={60} stress={0.2} />
        <PageHeader title="Trabajo" subtitle="Conectá tus fuentes para ver tu semana." />
        <EmptyState
          art="(·_·)"
          title="Todavía no hay actividad de trabajo"
          description="Conectá GitHub, Linear, Slack o Calendar en Ajustes. Leemos horarios y cantidades, nunca el contenido."
        />
        <Panel label="conectá tus fuentes" meta="privado, solo vos">
          <SourcesList sources={oauthSources} />
        </Panel>
      </Screen>
    );
  }

  const { counts } = buildWorkPrompt(userId);
  const connected = [day && "GitHub", linear.hasData && "Linear", slack.hasData && "Slack", (hasCalendar || meetings.length > 0) && "Calendar"].filter(Boolean).join(" · ");
  const meetingSlots = meetingSlotsToday(userId);
  const slots = Array.from({ length: MEETING_SLOTS_PER_DAY }, (_, i) => meetingSlots.some(([a, b]) => i >= a && i < b));
  const series = day
    ? [
        { label: day.sleepIsSimulated ? "sueño [simulado]" : "sueño", values: day.week.sleepMin, className: "text-sleep" },
        { label: "commits", values: day.week.commits, className: "text-work" },
        { label: "ánimo", values: day.week.mood, className: "text-mood" },
      ]
    : [];

  return (
    <Screen>
      <Pulse bpm={60} stress={0.35} />
      <PageHeader title="Trabajo" subtitle={connected || "Conectá fuentes en Ajustes"} />

      {!hasAnyConnected && (
        <Panel label="conectá tus fuentes" meta="privado, solo vos">
          <p className="text-[15px] leading-relaxed text-foreground/90">Conectá al menos una para que build101 cruce tu trabajo con tu cuerpo. Leemos horarios y cantidades, nunca contenido.</p>
          <SourcesList sources={oauthSources} />
        </Panel>
      )}

      <Summary label="hoy, en trabajo" src="/api/summary/work" fallback={EXAMPLE_WORK_SUMMARY} counts={counts} isExample={false} />

      {day && (
        <Panel label="git log · hoy" meta={`${day.commits} commits`}>
          <pre className="m-0 overflow-x-auto whitespace-pre font-mono text-xs leading-[1.7]">
            {day.log.map((entry, i) => (
              <span key={i}><LogLine entry={entry} />{"\n"}</span>
            ))}
          </pre>
        </Panel>
      )}

      <Panel label="linear · 7 días" meta={linear.hasData ? `${linear.completed} completados` : "sin conectar"}>
        {linear.hasData ? (
          <>
            <p className="grid grid-cols-3 gap-2 font-mono text-[13px] tabular-nums">
              <span><b className="block text-[22px] font-semibold text-foreground">{linear.created}</b><span className="text-dim">creados</span></span>
              <span><b className="block text-[22px] font-semibold text-foreground">{linear.started}</b><span className="text-dim">empezados</span></span>
              <span><b className="block text-[22px] font-semibold text-work">{linear.completed}</b><span className="text-dim">completados</span></span>
            </p>
            {linear.inProgress.length > 0 && (
              <ul className="grid gap-1.5 border-t border-white/10 pt-2.5">
                {linear.inProgress.map((i) => (
                  <li key={i.id} className="grid grid-cols-[auto_1fr] gap-2 text-[15px]">
                    <span className="font-mono text-[13px] text-work">{i.id}</span>
                    <span className="truncate">{i.title}</span>
                  </li>
                ))}
              </ul>
            )}
          </>
        ) : (
          <p className="text-[15px] text-dim">Conectá Linear en Ajustes para ver tus issues de la semana.</p>
        )}
      </Panel>

      <SlackPanel s={slack} />

      {meetings.length > 0 ? (
        <Panel label="reuniones · hoy" meta={`${meetings.length} · ${formatDuration(meetings.reduce((sum, m) => sum + m.durationMin, 0))}`}>
          <pre aria-hidden className="m-0 whitespace-pre font-mono text-[13px] leading-tight">
            {slots.map((busy, i) => <span key={i} className={busy ? "text-work" : "text-[#2d3345]"}>{busy ? "█" : "░"}</span>)}
          </pre>
          <pre aria-hidden className="m-0 whitespace-pre font-mono text-[13px] text-faint">{"09       12       15       18"}</pre>
        </Panel>
      ) : hasCalendar ? (
        <Panel label="reuniones · hoy" meta="0">
          <p className="text-[15px] text-dim">Sin reuniones hoy.</p>
        </Panel>
      ) : (
        <Panel label="reuniones · hoy" meta="sin conectar">
          <p className="text-[15px] text-dim">Conectá Calendar en Ajustes: contamos tus franjas de reunión, nunca el título ni los invitados.</p>
        </Panel>
      )}

      {day && (
        <Panel label="sueño × commits × ánimo · 7 días">
          <div className="grid gap-1.5 font-mono">
            {series.map((s) => (
              <div key={s.label} className="grid grid-cols-[76px_1fr] items-center">
                <span className="text-xs text-dim">{s.label}</span>
                <span role="img" aria-label={`${s.label}: ${s.values.map((v) => v ?? "sin dato").join(", ")}`} className={`text-lg tracking-[3px] ${s.className}`}>{sparkGaps(s.values)}</span>
              </div>
            ))}
          </div>
          <CorrelationNote days={day.daysOfData} />
        </Panel>
      )}
    </Screen>
  );
}
