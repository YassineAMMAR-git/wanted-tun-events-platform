"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

const INTERVAL_MS = 5000;
const MAX_DURATION_MS = 30 * 60 * 1000;

/**
 * Paiement reçu mais pas encore confirmé par Mollie (virement, validation de la banque…) :
 * la page de paiement se recharge toute seule jusqu'à constater le paiement (30 minutes au plus).
 */
export function PaymentWatcher({ label }: { label: string }) {
  const router = useRouter();

  useEffect(() => {
    const started = Date.now();
    const timer = window.setInterval(() => {
      if (Date.now() - started > MAX_DURATION_MS) {
        window.clearInterval(timer);
        return;
      }
      if (document.visibilityState === "visible") router.refresh();
    }, INTERVAL_MS);
    // Retour sur l'onglet après avoir payé dans l'autre : vérification immédiate.
    const onFocus = () => router.refresh();
    window.addEventListener("focus", onFocus);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener("focus", onFocus);
    };
  }, [router]);

  return (
    <p className="flex items-center justify-center gap-2 text-xs text-zinc-500" role="status">
      <span className="inline-block h-2 w-2 animate-pulse rounded-full bg-amber-500" aria-hidden="true" />
      {label}
    </p>
  );
}
