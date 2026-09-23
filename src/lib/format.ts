import { defaultLocale, intlLocales, type Locale } from "@/i18n/config";

export const TIME_ZONE = "Europe/Paris";
export const CURRENCY = "EUR";

/* -------------------------------------------------------------------------- */
/* Formateurs par langue (créés une seule fois puis réutilisés)               */
/* -------------------------------------------------------------------------- */

type Formatters = {
  day: Intl.DateTimeFormat;
  short: Intl.DateTimeFormat;
  time: Intl.DateTimeFormat;
};

const formattersByLocale = new Map<Locale, Formatters>();

function formatters(locale: Locale): Formatters {
  let cached = formattersByLocale.get(locale);
  if (!cached) {
    const intl = intlLocales[locale];
    cached = {
      day: new Intl.DateTimeFormat(intl, { weekday: "long", day: "numeric", month: "long", year: "numeric", timeZone: TIME_ZONE }),
      short: new Intl.DateTimeFormat(intl, { weekday: "short", day: "numeric", month: "short", timeZone: TIME_ZONE }),
      time: new Intl.DateTimeFormat(intl, { hour: "2-digit", minute: "2-digit", hour12: false, timeZone: TIME_ZONE }),
    };
    formattersByLocale.set(locale, cached);
  }
  return cached;
}

const dateTimeParts = new Intl.DateTimeFormat("en-CA", {
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
  timeZone: TIME_ZONE,
});

export function formatDate(date: Date, locale: Locale = defaultLocale): string {
  return formatters(locale).day.format(date);
}

export function formatShortDate(date: Date, locale: Locale = defaultLocale): string {
  return formatters(locale).short.format(date);
}

/** « 18h00 » en français, « 18:00 » en anglais et en arabe. */
export function formatTime(date: Date, locale: Locale = defaultLocale): string {
  const value = formatters(locale).time.format(date);
  return locale === "fr" ? value.replace(":", "h") : value;
}

const dateTimeJoiners: Record<Locale, string> = { fr: " à ", en: " at ", ar: " - " };

export function formatDateTime(date: Date, locale: Locale = defaultLocale): string {
  return `${formatDate(date, locale)}${dateTimeJoiners[locale]}${formatTime(date, locale)}`;
}

/** Montant stocké en centimes d'euro → « 15 € », « €15 », « 15 € » (arabe) ou avec centimes si besoin. */
export function formatPrice(cents: number, locale: Locale = defaultLocale): string {
  const hasCents = cents % 100 !== 0;
  return new Intl.NumberFormat(intlLocales[locale], {
    style: "currency",
    currency: CURRENCY,
    minimumFractionDigits: hasCents ? 2 : 0,
    maximumFractionDigits: 2,
  }).format(cents / 100);
}

/** Centimes → valeur par défaut d'un champ « prix » exprimé en euros. */
export function centsToEurosInput(cents: number): string {
  return (cents / 100).toFixed(2);
}

const durationUnits: Record<Locale, { hour: string; minute: string }> = {
  fr: { hour: "h", minute: "min" },
  en: { hour: "h", minute: "min" },
  ar: { hour: "س", minute: "د" },
};

/** 90 → « 1 h 30 » (fr), « 1 h 30 min » (en), « 1 س 30 د » (ar). */
export function formatDuration(minutes: number, locale: Locale = defaultLocale): string {
  const { hour, minute } = durationUnits[locale];
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  if (hours === 0) return `${rest} ${minute}`;
  if (rest === 0) return `${hours} ${hour}`;
  if (locale === "fr") return `${hours} ${hour} ${String(rest).padStart(2, "0")}`;
  return `${hours} ${hour} ${rest} ${minute}`;
}

/* -------------------------------------------------------------------------- */
/* Heure de Paris                                                             */
/* -------------------------------------------------------------------------- */

/** Décalage en minutes entre l'heure de Paris et UTC à un instant donné (60 en hiver, 120 en été). */
function parisOffsetMinutes(date: Date): number {
  const parts = dateTimeParts.formatToParts(date);
  const get = (type: string) => Number(parts.find((part) => part.type === type)?.value ?? 0);
  const wallClockAsUtc = Date.UTC(get("year"), get("month") - 1, get("day"), get("hour") % 24, get("minute"));
  return Math.round((wallClockAsUtc - Math.floor(date.getTime() / 60_000) * 60_000) / 60_000);
}

/**
 * Interprète une valeur `datetime-local` (« 2026-10-25T18:00 ») comme une heure de Paris,
 * heure d'été / d'hiver comprise. Retourne null si la valeur est invalide.
 */
export function parseParisDateTime(value: string): Date | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/.exec(value.trim());
  if (!match) return null;
  const [year, month, day, hour, minute] = match.slice(1).map(Number);
  const wallClockAsUtc = Date.UTC(year, month - 1, day, hour, minute);
  const firstGuess = new Date(wallClockAsUtc - parisOffsetMinutes(new Date(wallClockAsUtc)) * 60_000);
  // Second passage : corrige les heures proches d'un changement d'heure.
  const result = new Date(wallClockAsUtc - parisOffsetMinutes(firstGuess) * 60_000);
  return Number.isNaN(result.getTime()) ? null : result;
}

/** Format `datetime-local` en heure de Paris, utilisable dans un input. */
export function toDateTimeLocalValue(date: Date): string {
  const parts = dateTimeParts.formatToParts(date);
  const get = (type: string) => parts.find((part) => part.type === type)?.value ?? "00";
  return `${get("year")}-${get("month")}-${get("day")}T${get("hour")}:${get("minute")}`;
}

export function isPast(date: Date, reference: Date = new Date()): boolean {
  return date.getTime() < reference.getTime();
}

export function daysBetween(a: Date, b: Date): number {
  return Math.ceil((a.getTime() - b.getTime()) / (1000 * 60 * 60 * 24));
}

export function slugify(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "")
    .slice(0, 80);
}

/* -------------------------------------------------------------------------- */
/* Statuts : styles ici, libellés dans les traductions (status.*)             */
/* -------------------------------------------------------------------------- */

export const SESSION_STATUSES = ["scheduled", "cancelled", "postponed", "done"] as const;
export type SessionStatus = (typeof SESSION_STATUSES)[number];
export const SESSION_STATUS_STYLES: Record<SessionStatus, string> = {
  scheduled: "bg-emerald-500/15 text-emerald-300 border-emerald-500/30",
  cancelled: "bg-rose-500/15 text-rose-300 border-rose-500/30",
  postponed: "bg-amber-500/15 text-amber-200 border-amber-500/30",
  done: "bg-zinc-500/15 text-zinc-300 border-zinc-500/30",
};
export const toSessionStatus = (value: string): SessionStatus =>
  (SESSION_STATUSES as readonly string[]).includes(value) ? (value as SessionStatus) : "scheduled";

export const ATTENDANCE_STATUSES = ["confirmed", "pending", "declined"] as const;
export type AttendanceStatus = (typeof ATTENDANCE_STATUSES)[number];
export const ATTENDANCE_STATUS: Record<AttendanceStatus, { dot: string; className: string }> = {
  confirmed: { dot: "🟢", className: "bg-emerald-500/15 text-emerald-300 border-emerald-500/30" },
  pending: { dot: "🟠", className: "bg-amber-500/15 text-amber-200 border-amber-500/30" },
  declined: { dot: "🔴", className: "bg-rose-500/15 text-rose-300 border-rose-500/30" },
};
export const toAttendanceStatus = (value: string): AttendanceStatus =>
  (ATTENDANCE_STATUSES as readonly string[]).includes(value) ? (value as AttendanceStatus) : "pending";

export const SUBSCRIPTION_STATUSES = ["pending", "active", "expired", "cancelled"] as const;
export type SubscriptionStatus = (typeof SUBSCRIPTION_STATUSES)[number];
export const SUBSCRIPTION_STATUS: Record<SubscriptionStatus, string> = {
  pending: "bg-amber-500/15 text-amber-200 border-amber-500/30",
  active: "bg-emerald-500/15 text-emerald-300 border-emerald-500/30",
  expired: "bg-zinc-500/15 text-zinc-300 border-zinc-500/30",
  cancelled: "bg-rose-500/15 text-rose-300 border-rose-500/30",
};
export const toSubscriptionStatus = (value: string): SubscriptionStatus =>
  (SUBSCRIPTION_STATUSES as readonly string[]).includes(value) ? (value as SubscriptionStatus) : "pending";
