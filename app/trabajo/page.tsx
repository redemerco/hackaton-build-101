import { Pulse } from "@/components/ascii/ascii-field";
import { Panel } from "@/components/glass/panel";
import { PageHeader } from "@/components/page-header";
import { Screen } from "@/components/screen";
import { formatDuration, sparkline } from "@/lib/ascii";
import { getWorkDay, MEETING_SLOTS_PER_DAY, meetingMinutes, type WorkLogEntry } from "@/lib/work";

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

export default function TrabajoPage() {
  const day = getWorkDay();
  const slots = Array.from({ length: MEETING_SLOTS_PER_DAY }, (_, i) => day.meetingSlots.some(([a, b]) => i >= a && i < b));
  const series = [
    { label: "sueño", values: day.week.sleepMin, className: "text-sleep" },
    { label: "commits", values: day.week.commits, className: "text-work" },
    { label: "ánimo", values: day.week.mood, className: "text-mood" },
  ];

  return (
    <Screen>
      <Pulse bpm={60} stress={0.35} />
      <PageHeader title="Trabajo" subtitle={day.isExample ? "[ejemplo] hasta conectar GitHub, Linear y Calendar" : "GitHub · Linear · Calendar"} />

      <Panel label="git log · hoy" meta={`${day.commits} commits`}>
        <pre className="m-0 overflow-x-auto whitespace-pre font-mono text-xs leading-[1.7]">
          {day.log.map((entry, i) => (
            <span key={i}><LogLine entry={entry} />{"\n"}</span>
          ))}
        </pre>
      </Panel>

      <Panel label="reuniones" meta={`${day.meetingSlots.length} · ${formatDuration(meetingMinutes(day.meetingSlots))}`}>
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
              <span aria-label={`${s.label}: ${s.values.join(", ")}`} className={`text-lg tracking-[3px] ${s.className}`}>{sparkline(s.values)}</span>
            </div>
          ))}
        </div>
        <p className="text-[15px] leading-relaxed text-foreground/90">El miércoles dormiste menos, hiciste menos commits y tu ánimo bajó. Correlación, no causa.</p>
      </Panel>
    </Screen>
  );
}
