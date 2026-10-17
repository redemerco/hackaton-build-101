"use client";

import { useRef, useState, type ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * Slides tipo Wrapped con scroll-snap nativo: el swipe es el del sistema (inercia y rebote de iOS gratis).
 * Solo JS para los puntitos de posición y para saltar tocando uno.
 */
export function WrappedSlides({ slides }: { slides: { id: string; content: ReactNode }[] }) {
  const trackRef = useRef<HTMLDivElement>(null);
  const [index, setIndex] = useState(0);

  const onScroll = () => {
    const el = trackRef.current;
    if (!el) return;
    setIndex(Math.round(el.scrollLeft / el.clientWidth));
  };
  const goTo = (i: number) => {
    const el = trackRef.current;
    el?.scrollTo({ left: i * el.clientWidth, behavior: "smooth" });
  };

  return (
    <div className="grid gap-3">
      <div
        ref={trackRef}
        onScroll={onScroll}
        aria-roledescription="carrusel"
        className="-mx-4 flex snap-x snap-mandatory overflow-x-auto overscroll-x-contain scroll-smooth [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        {slides.map((s, i) => (
          <section
            key={s.id}
            aria-roledescription="slide"
            aria-label={`${i + 1} de ${slides.length}`}
            className="w-full shrink-0 snap-center px-4"
          >
            {s.content}
          </section>
        ))}
      </div>
      <div className="flex justify-center gap-1" role="tablist" aria-label="Slides">
        {slides.map((s, i) => (
          <button
            key={s.id}
            type="button"
            role="tab"
            aria-selected={i === index}
            aria-label={`Ir a la slide ${i + 1}`}
            onClick={() => goTo(i)}
            className="grid size-8 place-items-center"
          >
            <span className={cn("h-1.5 rounded-full bg-white/25 transition-[width,background-color] duration-300 ease-out", i === index ? "w-5 bg-mood" : "w-1.5")} />
          </button>
        ))}
      </div>
    </div>
  );
}
