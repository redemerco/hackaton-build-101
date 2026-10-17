"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { BriefcaseIcon, CalendarRangeIcon, HeartPulseIcon, SparkleIcon } from "lucide-react";
import { cn } from "@/lib/utils";

const TABS = [
  { href: "/", label: "Hoy", Icon: SparkleIcon },
  { href: "/cuerpo", label: "Cuerpo", Icon: HeartPulseIcon },
  null, // la cámara va al centro
  { href: "/trabajo", label: "Trabajo", Icon: BriefcaseIcon },
  { href: "/semana", label: "Semana", Icon: CalendarRangeIcon },
] as const;

/** Barra flotante de vidrio con la cámara como burbuja central (beat 0:45 de la demo). */
export function TabBar() {
  const pathname = usePathname();
  const isActive = (href: string) => (href === "/" ? pathname === "/" : pathname.startsWith(href));

  return (
    <nav
      aria-label="Principal"
      className="glass fixed inset-x-3 z-40 mx-auto grid h-16 max-w-md grid-cols-[1fr_1fr_72px_1fr_1fr] items-center rounded-full px-1"
      style={{ bottom: "calc(env(safe-area-inset-bottom) + 12px)" }}
    >
      {TABS.map((tab) =>
        tab === null ? (
          <Link
            key="camara"
            href="/comer"
            aria-label="Sacarle una foto a la comida"
            aria-current={isActive("/comer") ? "page" : undefined}
            className="glass press -mt-7 grid size-14 place-items-center justify-self-center rounded-full"
            style={{ background: "radial-gradient(circle at 32% 26%, rgb(255 255 255 / .6), transparent 46%), rgb(255 179 64 / .32)" }}
          >
            <span className="size-6 rounded-full border-2 border-foreground" />
          </Link>
        ) : (
          <Link
            key={tab.href}
            href={tab.href}
            aria-current={isActive(tab.href) ? "page" : undefined}
            className={cn(
              "press flex flex-col items-center gap-1 py-2 text-[10px] font-medium text-dim",
              isActive(tab.href) && "text-foreground [&_svg]:text-mood",
            )}
          >
            <tab.Icon className="size-5" aria-hidden />
            {tab.label}
          </Link>
        ),
      )}
    </nav>
  );
}
