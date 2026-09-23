import { NextResponse, type NextRequest } from "next/server";
import { PROTECTED_PATH_PREFIXES, SESSION_COOKIE_NAME } from "@/lib/auth/constants";

/**
 * Vérification optimiste : sans cookie de session, inutile de rendre une page protégée,
 * on redirige directement vers la connexion en conservant la page demandée.
 * La vraie vérification (session valide, rôle) reste faite côté serveur dans chaque page et action.
 */
export function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl;
  const isProtected = PROTECTED_PATH_PREFIXES.some((prefix) => pathname.startsWith(prefix));

  if (isProtected && !request.cookies.has(SESSION_COOKIE_NAME)) {
    const login = new URL("/connexion", request.nextUrl.origin);
    login.searchParams.set("next", `${pathname}${search}`);
    return NextResponse.redirect(login);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/admin/:path*", "/espace-personnel/:path*", "/abonnement/:path*"],
};
