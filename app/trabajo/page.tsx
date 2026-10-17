import { Pulse } from "@/components/ascii/ascii-field";
import { Panel } from "@/components/glass/panel";
import { PageHeader } from "@/components/page-header";
import { Screen } from "@/components/screen";
import { formatDuration, sparkline } from "@/lib/ascii";
import { confidenceStars, getWorkDay, MEETING_SLOTS_PER_DAY, meetingMinutes, MIN_DAYS_FOR_CORRELATION, type WorkLogEntry } from "@/lib/work";
import { getCurrentUser } from "@/lib/users";
import { getLinearWeek, getSlackToday, type SlackToday } from "@/lib/work-signals";

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
      {hasEnough ? (
        <p className="text-[15px] leading-relaxed text-foreground/90">
          Los días que dormiste menos de 6 h hiciste menos commits y tu ánimo bajó.
        </p>
      ) : (
        <p className="text-[15px] leading-relaxed text-foreground/90">
          Todavía no alcanza: hacen falta {MIN_DAYS_FOR_CORRELATION} días para decir algo.
        </p>
      )}
      <p className="text-xs leading-relaxed text-dim">Correlación, no causa: puede ser una cosa sobre la otra, un tercer factor o casualidad.</p>
    </div>
  );
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
  const sources = [!day.isExample && "GitHub", linear.hasData && "Linear", slack.hasData && "Slack"].filter(Boolean).join(" · ");
  const slots = Array.from({ length: MEETING_SLOTS_PER_DAY }, (_, i) => day.meetingSlots.some(([a, b]) => i >= a && i < b));
  const series = [
    { label: "sueño", values: day.week.sleepMin, className: "text-sleep" },
    { label: "commits", values: day.week.commits, className: "text-work" },
    { label: "ánimo", values: day.week.mood, className: "text-mood" },
  ];

  return (
    <Screen>
      <Pulse bpm={60} stress={0.35} />
      <PageHeader title="Trabajo" subtitle={sources ? `${sources} · Calendar pendiente` : "[ejemplo] hasta conectar fuentes en Ajustes"} />

      <Panel label="git log · hoy" meta={`${day.commits} commits`}>
        <pre className="m-0 overflow-x-auto whitespace-pre font-mono text-xs leading-[1.7]">
          {day.log.map((entry, i) => (
            <span key={i}><LogLine entry={entry} />{"\n"}</span>
          ))}
        </pre>
      </Panel>

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

      <Panel label="reuniones" meta={`[ejemplo · falta Calendar] ${day.meetingSlots.length} · ${formatDuration(meetingMinutes(day.meetingSlots))}`}>
        <pre aria-hidden className="m-0 whitespace-pre font-mono text-[13px] leading-tight">
          {slots.map((busy, i) => <span key={i} className={busy ? "text-work" : "text-[#2d3345]"}>{busy ? "█" : "░"}</span>)}
        </pre>
        <pre aria-hidden className="m-0 whitespace-pre font-mono text-[13px] text-faint">{"09       12       15       18"}</pre>
      </Panel>

      <Panel label="sueño × commits × ánimo · 7 días">
        <div className="grid gap-1.5 font-mono">
          {series.map((s) => (
            <div key={s.label} className="grid grid-cols-[76px_1fr] items-center">
              <span className="text-xs text-dim">{s.label}</span>
              <span role="img" aria-label={`${s.label}: ${s.values.join(", ")}`} className={`text-lg tracking-[3px] ${s.className}`}>{sparkline(s.values)}</span>
            </div>
          ))}
        </div>
        <CorrelationNote days={day.daysOfData} />
      </Panel>
    </Screen>
  );
}
