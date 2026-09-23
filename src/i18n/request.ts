import { cookies } from "next/headers";
import { getRequestConfig } from "next-intl/server";
import { LOCALE_COOKIE, toLocale } from "@/i18n/config";
import { messages } from "@/i18n/messages";
import { TIME_ZONE } from "@/lib/format";

/** Langue de la requête : cookie choisi via le sélecteur, français par défaut. */
export default getRequestConfig(async () => {
  const locale = toLocale((await cookies()).get(LOCALE_COOKIE)?.value);
  return {
    locale,
    messages: messages[locale],
    timeZone: TIME_ZONE,
  };
});
