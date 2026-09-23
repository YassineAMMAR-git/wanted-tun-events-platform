import "server-only";
import { cache } from "react";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { and, eq, gt, lte, ne } from "drizzle-orm";
import { db } from "@/db";
import { userSessions, users, type User } from "@/db/schema";
import { SESSION_COOKIE_NAME, SESSION_TTL_MS } from "@/lib/auth/constants";
import { generateToken, hashToken } from "@/lib/auth/tokens";

/**
 * Crée une session en base et pose le cookie correspondant.
 * Le cookie contient un jeton aléatoire ; la base ne stocke que son empreinte.
 */
export async function createSession(user: Pick<User, "id" | "role">): Promise<void> {
  const { token, tokenHash } = generateToken();
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS[user.role]);
  const requestHeaders = await headers();

  // Nettoyage opportuniste des sessions expirées de cet utilisateur.
  await db.delete(userSessions).where(and(eq(userSessions.userId, user.id), lte(userSessions.expiresAt, new Date())));

  await db.insert(userSessions).values({
    userId: user.id,
    tokenHash,
    expiresAt,
    userAgent: requestHeaders.get("user-agent")?.slice(0, 255) ?? null,
    ipAddress: clientIp(requestHeaders),
  });

  const jar = await cookies();
  jar.set(SESSION_COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    expires: expiresAt,
  });
}

/** Déconnexion : supprime la session en base (elle devient inutilisable) puis le cookie. */
export async function destroySession(): Promise<void> {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE_NAME)?.value;
  if (token) await db.delete(userSessions).where(eq(userSessions.tokenHash, hashToken(token)));
  jar.delete(SESSION_COOKIE_NAME);
}

/**
 * Révoque toutes les sessions d'un utilisateur (changement de mot de passe, de rôle, d'e-mail…).
 * Avec `keepCurrent`, la session du navigateur courant est conservée.
 */
export async function revokeUserSessions(userId: number, options: { keepCurrent?: boolean } = {}): Promise<void> {
  const currentToken = options.keepCurrent ? (await cookies()).get(SESSION_COOKIE_NAME)?.value : undefined;
  await db
    .delete(userSessions)
    .where(
      currentToken
        ? and(eq(userSessions.userId, userId), ne(userSessions.tokenHash, hashToken(currentToken)))
        : eq(userSessions.userId, userId),
    );
}

/** Utilisateur connecté (session valide, non expirée, e-mail vérifié), mis en cache pour la requête. */
export const getCurrentUser = cache(async (): Promise<User | null> => {
  const token = (await cookies()).get(SESSION_COOKIE_NAME)?.value;
  if (!token || token.length > 128) return null;

  const row = (
    await db
      .select({ user: users })
      .from(userSessions)
      .innerJoin(users, eq(users.id, userSessions.userId))
      .where(and(eq(userSessions.tokenHash, hashToken(token)), gt(userSessions.expiresAt, new Date())))
      .limit(1)
  )[0];

  if (!row || !row.user.emailVerifiedAt) return null;
  return row.user;
});

export async function requireUser(): Promise<User> {
  const user = await getCurrentUser();
  if (!user) redirect("/connexion");
  return user;
}

export async function requireAdmin(): Promise<User> {
  const user = await getCurrentUser();
  if (!user) redirect("/connexion");
  if (user.role !== "admin") redirect("/espace-personnel");
  return user;
}

export function isAdmin(user: Pick<User, "role"> | null | undefined): boolean {
  return user?.role === "admin";
}

function clientIp(requestHeaders: Headers): string | null {
  const forwarded = requestHeaders.get("x-forwarded-for")?.split(",")[0]?.trim();
  return (forwarded || requestHeaders.get("x-real-ip") || null)?.slice(0, 64) ?? null;
}
