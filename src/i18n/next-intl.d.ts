import type { Locale } from "@/i18n/config";
import type { Messages } from "@/i18n/messages";

// Clés de traduction typées : une clé absente ou mal orthographiée est une erreur TypeScript.
declare module "next-intl" {
  interface AppConfig {
    Locale: Locale;
    Messages: Messages;
  }
}
