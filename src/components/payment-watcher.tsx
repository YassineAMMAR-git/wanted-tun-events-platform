"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

/** Juste après le paiement, la confirmation arrive en quelques secondes : on vérifie souvent, puis on espace. */
const FAST_INTERVAL_MS = 1000;
const FAST_DURATION_MS = 45 * 1000;
const SLOW_INTERVAL_MS = 5000;
const MAX_DURATION_MS = 30 * 60 * 1000;

/**
 * Au retour de la page de paiement, tant que Mollie n'a pas confirmé, la page se recharge toute seule :
 * chaque seconde pendant 45 secondes, puis toutes les 5 secondes (30 minutes au plus).
 * `maxDurationMs` limite l'attente quand on ne sait pas si le client a réellement payé.
 */
export function PaymentWatcher({ label, maxDurationMs = MAX_DURATION_MS }: { label: string; maxDurationMs?: number }) {
  const router = useRouter();

  useEffect(() => {
    const started = Date.now();
    let timer = 0;
    const tick = () => {
      const elapsed = Date.now() - started;
      if (elapsed > maxDurationMs) return;
      if (document.visibilityState === "visible") router.refresh();
      timer = window.setTimeout(tick, elapsed < FAST_DURATION_MS ? FAST_INTERVAL_MS : SLOW_INTERVAL_MS);
    };
    timer = window.setTimeout(tick, FAST_INTERVAL_MS);
    // Retour sur l'onglet : vérification immédiate.
    const onFocus = () => router.refresh();
    window.addEventListener("focus", onFocus);
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener("focus", onFocus);
    };
  }, [router, maxDurationMs]);

  return (
    <p className="flex items-center justify-center gap-2 text-xs text-zinc-500" role="status">
      <span className="inline-block h-2 w-2 animate-pulse rounded-full bg-amber-500" aria-hidden="true" />
      {label}
    </p>
  );
}
