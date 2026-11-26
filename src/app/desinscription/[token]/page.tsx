import type { Metadata } from "next";
import { eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { db } from "@/db";
import { users } from "@/db/schema";
import { Card } from "@/components/ui";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { robots: { index: false, follow: false } };

/**
 * Lien de désinscription des annonces de nouvelles séances (présent dans chaque annonce).
 * Le changement se fait par un bouton, jamais à l'ouverture du lien : un logiciel qui ouvre les liens d'un
 * e-mail pour les analyser ne désinscrit pas le client à sa place.
 */
export default async function UnsubscribePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const t = await getTranslations("unsubscribePage");
  const user = (
    await db
      .select({ id: users.id, email: users.email, optOut: users.announcementsOptOut })
      .from(users)
      .where(eq(users.unsubscribeToken, token))
      .limit(1)
  )[0];

  if (!user) {
    return (
      <div className="mx-auto max-w-lg">
        <Card>
          <h1 className="text-2xl font-bold text-zinc-900">{t("invalidTitle")}</h1>
          <p className="mt-2 text-sm text-zinc-600">{t("invalidText")}</p>
        </Card>
      </div>
    );
  }

  async function setOptOut(formData: FormData) {
    "use server";
    const optOut = formData.get("optOut") === "1";
    await db.update(users).set({ announcementsOptOut: optOut }).where(eq(users.unsubscribeToken, token));
    redirect(`/desinscription/${token}`);
  }

  return (
    <div className="mx-auto max-w-lg">
      <Card>
        <h1 className="text-2xl font-bold text-zinc-900">{user.optOut ? t("doneTitle") : t("title")}</h1>
        <p className="mt-2 text-sm text-zinc-600">
          {user.optOut ? t("doneText") : t("text")}{" "}
          <span className="font-semibold text-zinc-800" dir="ltr">
            {user.email}
          </span>
        </p>
        <p className="mt-2 text-xs text-zinc-500">{t("note")}</p>
        <form action={setOptOut} className="mt-5">
          <input type="hidden" name="optOut" value={user.optOut ? "0" : "1"} />
          <button type="submit" className={user.optOut ? "btn btn-ghost w-full" : "btn btn-primary w-full"}>
            {user.optOut ? t("resubscribe") : t("confirm")}
          </button>
        </form>
      </Card>
    </div>
  );
}
