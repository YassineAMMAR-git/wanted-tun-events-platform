import "server-only";
import { randomBytes, scrypt, timingSafeEqual, type ScryptOptions } from "node:crypto";

/**
 * Hachage scrypt avec des paramètres recommandés par l'OWASP (N=2^15, r=8, p=3 ≈ 32 Mio).
 * Format stocké : scrypt$N$r$p$sel$empreinte (base64url), ce qui permet de faire évoluer
 * les paramètres sans invalider les mots de passe existants.
 */
const KEY_LENGTH = 64;
const CURRENT_PARAMS = { N: 2 ** 15, r: 8, p: 3 } as const;
/** Ancien format « scrypt$sel$empreinte » (paramètres Node par défaut). */
const LEGACY_PARAMS = { N: 2 ** 14, r: 8, p: 1, normalize: false } as const;

type ScryptParams = { N: number; r: number; p: number; normalize?: boolean };

function derive(password: string, salt: string | Buffer, params: ScryptParams): Promise<Buffer> {
  const { N, r, p, normalize = true } = params;
  const options: ScryptOptions = { N, r, p, maxmem: 128 * N * r * 2 };
  const input = normalize ? password.normalize("NFKC") : password;
  return new Promise((resolve, reject) => {
    scrypt(input, salt, KEY_LENGTH, options, (error, key) => (error ? reject(error) : resolve(key)));
  });
}

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const hash = await derive(password, salt, CURRENT_PARAMS);
  const { N, r, p } = CURRENT_PARAMS;
  return `scrypt$${N}$${r}$${p}$${salt.toString("base64url")}$${hash.toString("base64url")}`;
}

export type PasswordCheck = { valid: boolean; needsRehash: boolean };

export async function verifyPassword(password: string, stored: string): Promise<PasswordCheck> {
  const parts = stored.split("$");

  if (parts.length === 6 && parts[0] === "scrypt") {
    const [, N, r, p, salt, hash] = parts;
    const params = { N: Number(N), r: Number(r), p: Number(p) };
    const valid = await compare(password, Buffer.from(salt, "base64url"), Buffer.from(hash, "base64url"), params);
    const outdated = params.N !== CURRENT_PARAMS.N || params.r !== CURRENT_PARAMS.r || params.p !== CURRENT_PARAMS.p;
    return { valid, needsRehash: valid && outdated };
  }

  if (parts.length === 3 && parts[0] === "scrypt") {
    // Comptes créés avant le renforcement : le sel était utilisé sous forme de texte hexadécimal.
    const [, salt, hash] = parts;
    const valid = await compare(password, salt, Buffer.from(hash, "hex"), LEGACY_PARAMS);
    return { valid, needsRehash: valid };
  }

  return { valid: false, needsRehash: false };
}

async function compare(password: string, salt: string | Buffer, expected: Buffer, params: ScryptParams): Promise<boolean> {
  if (expected.length !== KEY_LENGTH) return false;
  const derived = await derive(password, salt, params);
  return timingSafeEqual(derived, expected);
}

let dummyHash: Promise<string> | null = null;

/**
 * À appeler quand l'e-mail est inconnu : effectue le même travail qu'une vraie vérification
 * afin que le temps de réponse ne révèle pas si un compte existe.
 */
export async function burnPasswordCheck(password: string): Promise<void> {
  dummyHash ??= hashPassword(randomBytes(16).toString("hex"));
  await verifyPassword(password, await dummyHash);
}
