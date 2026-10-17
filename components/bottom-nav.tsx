"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { BriefcaseIcon, HeartPulseIcon, HouseIcon, UtensilsIcon } from "lucide-react";
import { cn } from "@/lib/utils";

const TABS = [
  { href: "/", label: "Inicio", Icon: HouseIcon },
  { href: "/cuerpo", label: "Cuerpo", Icon: HeartPulseIcon },
  { href: "/comidas", label: "Comidas", Icon: UtensilsIcon },
  { href: "/trabajo", label: "Trabajo", Icon: BriefcaseIcon },
] as const;

export function BottomNav() {
  const pathname = usePathname();
  return (
    <nav className="fixed inset-x-0 bottom-0 z-10 border-t bg-background/90 backdrop-blur pb-[env(safe-area-inset-bottom)]">
      <ul className="mx-auto grid max-w-md grid-cols-4">
        {TABS.map(({ href, label, Icon }) => {
          const isActive = href === "/" ? pathname === "/" : pathname.startsWith(href);
          return (
            <li key={href}>
              <Link
                href={href}
                aria-current={isActive ? "page" : undefined}
                className={cn(
                  "flex flex-col items-center gap-1 py-2.5 text-xs text-muted-foreground transition-colors",
                  isActive && "text-emerald-400",
                )}
              >
                <Icon className="size-5" aria-hidden />
                {label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
