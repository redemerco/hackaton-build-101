"use client";

import { useLayoutEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { BriefcaseIcon, CalendarRangeIcon, HeartPulseIcon, UserRoundIcon } from "lucide-react";
import { cn } from "@/lib/utils";

const TABS = [
  { href: "/", label: "Yo", Icon: UserRoundIcon },
  { href: "/salud", label: "Salud", Icon: HeartPulseIcon },
  { href: "/trabajo", label: "Trabajo", Icon: BriefcaseIcon },
  { href: "/semana", label: "Semana", Icon: CalendarRangeIcon },
] as const;

const activeIndexOf = (pathname: string) =>
  TABS.findIndex((t) => (t.href === "/" ? pathname === "/" : pathname.startsWith(t.href)));

type Pill = { x: number; width: number } | null;

/**
 * Barra flotante de vidrio. Una pastilla se desliza con resorte hasta la tab activa,
 * y la navegación lleva la dirección (nav-forward / nav-back) para que la pantalla deslice hacia ese lado.
 */
export function TabBar() {
  const pathname = usePathname();
  const active = activeIndexOf(pathname);
  const navRef = useRef<HTMLElement>(null);
  const tabRefs = useRef<(HTMLAnchorElement | null)[]>([]);
  const [pill, setPill] = useState<Pill>(null);
  const [isAnimated, setIsAnimated] = useState(false);

  useLayoutEffect(() => {
    const measure = () => {
      const nav = navRef.current;
      const tab = tabRefs.current[active];
      if (!nav || !tab) return setPill(null);
      const n = nav.getBoundingClientRect();
      const t = tab.getBoundingClientRect();
      setPill({ x: t.left - n.left, width: t.width });
      requestAnimationFrame(() => setIsAnimated(true));
    };
    measure();
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, [active]);

  return (
    <nav
      ref={navRef}
      aria-label="Principal"
      className="glass fixed inset-x-3 z-40 mx-auto grid h-16 max-w-md grid-cols-4 items-center rounded-full px-1"
      style={{ bottom: "calc(env(safe-area-inset-bottom) + 12px)", viewTransitionName: "tab-bar" }}
    >
      <span
        aria-hidden
        className={cn(
          "pointer-events-none absolute inset-y-1.5 left-0 rounded-full bg-white/12 shadow-[inset_0_1px_0_rgb(255_255_255/.35)]",
          // sin transición hasta la primera medida: si no, en cada carga desliza desde la izquierda
          isAnimated && "transition-[transform,width,opacity] duration-500 ease-[cubic-bezier(.34,1.56,.5,1)]",
        )}
        style={{ width: pill?.width ?? 0, transform: `translateX(${pill?.x ?? 0}px)`, opacity: pill ? 1 : 0 }}
      />
      {TABS.map((tab, i) => {
        const isActive = i === active;
        const types = i === active ? undefined : [i > active ? "nav-forward" : "nav-back"];
        const setRef = (el: HTMLAnchorElement | null) => { tabRefs.current[i] = el; };
        return (
          <Link
            key={tab.href}
            ref={setRef}
            href={tab.href}
            transitionTypes={types}
            aria-current={isActive ? "page" : undefined}
            className={cn(
              "press relative flex h-14 flex-col items-center justify-center gap-1 text-[11px] font-medium text-dim transition-colors duration-200",
              isActive && "text-foreground [&_svg]:text-mood",
            )}
          >
            <tab.Icon className={cn("size-5 transition-transform duration-300 ease-[cubic-bezier(.34,1.56,.5,1)]", isActive && "-translate-y-px scale-110")} aria-hidden />
            {tab.label}
          </Link>
        );
      })}
    </nav>
  );
}
