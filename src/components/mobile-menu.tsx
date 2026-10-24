"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { usePathname } from "next/navigation";

/**
 * Menu du téléphone (bouton « Menu » + panneau). Reste un <details> : il s'ouvre aussi sans JavaScript.
 * Le pied de page et l'en-tête étant conservés d'une page à l'autre, le panneau se referme après chaque
 * navigation, au toucher en dehors et avec la touche Échap.
 */
export function MobileMenu({ label, children }: { label: string; children: ReactNode }) {
  const ref = useRef<HTMLDetailsElement>(null);
  const pathname = usePathname();

  useEffect(() => {
    if (ref.current) ref.current.open = false;
  }, [pathname]);

  useEffect(() => {
    const close = (event: Event) => {
      const menu = ref.current;
      if (!menu?.open) return;
      if (event instanceof KeyboardEvent ? event.key === "Escape" : !menu.contains(event.target as Node)) menu.open = false;
    };
    document.addEventListener("pointerdown", close);
    document.addEventListener("keydown", close);
    return () => {
      document.removeEventListener("pointerdown", close);
      document.removeEventListener("keydown", close);
    };
  }, []);

  return (
    <details ref={ref} className="group">
      {/* Icône seule (l'en-tête est étroit sur téléphone) ; le libellé reste lu par les lecteurs d'écran. */}
      <summary
        title={label}
        className="btn btn-ghost h-9 w-9 list-none p-0 text-lg leading-none [&::-webkit-details-marker]:hidden"
      >
        <span aria-hidden="true" className="group-open:hidden">☰</span>
        <span aria-hidden="true" className="hidden group-open:inline">✕</span>
        <span className="sr-only">{label}</span>
      </summary>
      <div className="absolute start-2 end-2 mt-2 max-h-[calc(100dvh-5rem)] overflow-y-auto rounded-2xl border border-zinc-200 bg-white p-3 shadow-lg">
        {children}
      </div>
    </details>
  );
}
