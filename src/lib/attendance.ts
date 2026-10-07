// Règle de clôture des présences, partagée entre le serveur et les composants (aucun import serveur).

/** Les présences sont clôturées ce nombre d'heures avant le début de la séance. */
export const CONFIRMATION_CLOSE_HOURS = 48;

/** Dernier moment où un participant peut confirmer lui-même sa présence (séance samedi 17 h → jeudi 17 h). */
export function confirmationDeadline(startsAt: Date): Date {
  return new Date(startsAt.getTime() - CONFIRMATION_CLOSE_HOURS * 60 * 60 * 1000);
}

/**
 * Présences clôturées : le participant ne peut plus confirmer lui-même. Sans confirmation il est compté absent
 * et sa place peut être attribuée à quelqu'un d'autre ; seule l'administration peut encore le confirmer.
 */
export function isConfirmationClosed(startsAt: Date, reference: Date = new Date()): boolean {
  return reference.getTime() >= confirmationDeadline(startsAt).getTime();
}
