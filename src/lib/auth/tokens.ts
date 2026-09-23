import "server-only";
import { createHash, randomBytes } from "node:crypto";

/** Jeton aléatoire de 256 bits, sûr pour une URL ou un cookie. */
export function generateToken(): { token: string; tokenHash: string } {
  const token = randomBytes(32).toString("base64url");
  return { token, tokenHash: hashToken(token) };
}

/**
 * Seule l'empreinte SHA-256 du jeton est stockée en base : une fuite de la base
 * ne permet ni d'usurper une session ni de valider un e-mail.
 */
export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

/** Jeton court utilisé pour les liens de confirmation de présence aux séances. */
export function randomToken(): string {
  return randomBytes(24).toString("hex");
}
