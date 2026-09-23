import type {
  ACTIVITY_TRANSLATABLE,
  CATEGORY_TRANSLATABLE,
  ContentTranslations,
  PLAN_TRANSLATABLE,
  SESSION_TRANSLATABLE,
} from "@/db/schema";

/*
 * Traductions anglaises et arabes du contenu de démonstration.
 * Utilisées par le seed (base vide) et par scripts/apply-content-translations.ts (base existante).
 */

type Category = ContentTranslations<(typeof CATEGORY_TRANSLATABLE)[number]>;
type Activity = ContentTranslations<(typeof ACTIVITY_TRANSLATABLE)[number]>;
type Plan = ContentTranslations<(typeof PLAN_TRANSLATABLE)[number]>;
type Session = ContentTranslations<(typeof SESSION_TRANSLATABLE)[number]>;

/** Par slug de catégorie. */
export const CATEGORY_TRANSLATIONS: Record<string, Category> = {
  "concerts-et-spectacles": {
    en: { name: "Concerts & shows", description: "Open stages, live concerts and shows organised by WANTED TUN EVENTS." },
    ar: { name: "حفلات وعروض", description: "مسارح مفتوحة وحفلات حيّة وعروض من تنظيم WANTED TUN EVENTS." },
  },
  "club-de-chant": {
    en: { name: "Singing club", description: "Weekly singing workshops: vocal technique, repertoire and performance." },
    ar: { name: "نادي الغناء", description: "ورشات غناء أسبوعية: تقنيات الصوت والمخزون الغنائي والأداء على المسرح." },
  },
  campings: {
    en: { name: "Camping", description: "Supervised nature trips: bivouacs, campfires and group activities." },
    ar: { name: "التخييم", description: "رحلات مؤطَّرة في الطبيعة: مبيت في الخلاء، نار المخيّم وأنشطة جماعية." },
  },
  "soirees-ramadanesques": {
    en: { name: "Ramadan evenings", description: "Shared iftars, spiritual evenings and gatherings during the month of Ramadan." },
    ar: { name: "السهرات الرمضانية", description: "إفطارات جماعية وسهرات روحانية ولقاءات خلال شهر رمضان." },
  },
  coran: {
    en: { name: "Quran", description: "Recitation, memorisation and tajweed circles with experienced teachers." },
    ar: { name: "القرآن", description: "حلقات تلاوة وحفظ وتجويد مع مؤطّرين ذوي خبرة." },
  },
  "cercles-de-parole": {
    en: { name: "Talking circles", description: "Small-group spaces for listening and sharing. Opening soon." },
    ar: { name: "حلقات الحوار", description: "فضاءات للإصغاء والتبادل في مجموعات صغيرة. تُفتح قريبًا." },
  },
  "ateliers-psychologiques": {
    en: { name: "Wellbeing workshops", description: "Workshops led by wellbeing professionals. Opening soon." },
    ar: { name: "ورشات نفسية", description: "ورشات يقدّمها مختصون في الصحة النفسية. تُفتح قريبًا." },
  },
  "activites-sportives": {
    en: { name: "Group sports", description: "Hikes, group runs and sports challenges. Opening soon." },
    ar: { name: "أنشطة رياضية جماعية", description: "رحلات مشي وجري جماعي وتحديات رياضية. تُفتح قريبًا." },
  },
};

/** Par slug d'activité. */
export const ACTIVITY_TRANSLATIONS: Record<string, Activity> = {
  "club-de-chant-chorale-wanted": {
    en: {
      name: "Singing club — WANTED Choir",
      shortDescription: "One session a week to work on voice, harmony and stage presence.",
      description:
        "Join the WANTED TUN EVENTS choir: vocal warm-ups, breathing technique, multi-part harmony and preparation for an end-of-cycle concert. All levels are welcome — what matters is showing up regularly and enjoying singing together.",
      scheduleText: "Every Thursday, 6:00 pm → 7:30 pm",
    },
    ar: {
      name: "نادي الغناء — كورال WANTED",
      shortDescription: "حصة أسبوعية للعمل على الصوت والتناغم والحضور على المسرح.",
      description:
        "انضمّ إلى كورال WANTED TUN EVENTS: تمارين إحماء صوتي، وتقنيات التنفّس، والغناء بتناغم متعدد الأصوات، والتحضير لحفل نهاية الدورة. جميع المستويات مرحّب بها، والأهم هو الانتظام وحب الغناء معًا.",
      scheduleText: "كل خميس، 18:00 ← 19:30",
    },
  },
  "cercle-recitation-memorisation": {
    en: {
      name: "Recitation & memorisation circle",
      shortDescription: "Step-by-step learning with tajweed correction, in a small group.",
      description:
        "A weekly circle dedicated to memorising the Quran and mastering the rules of recitation. Each participant progresses at their own pace with individual follow-up, group revision and monthly goals.",
      scheduleText: "Every Saturday, 10:00 am → 11:30 am",
    },
    ar: {
      name: "حلقة التلاوة والحفظ",
      shortDescription: "تعلّم تدريجي مع تصحيح التجويد، ضمن مجموعة صغيرة.",
      description:
        "حلقة أسبوعية مخصّصة لحفظ القرآن الكريم وإتقان أحكام التلاوة. يتقدّم كل مشارك وفق وتيرته مع متابعة فردية ومراجعة جماعية وأهداف شهرية.",
      scheduleText: "كل سبت، 10:00 ← 11:30",
    },
  },
  "soiree-ramadanesque-iftar-nadhra": {
    en: {
      name: "Ramadan evening — Iftar & Nadhra",
      shortDescription: "A shared iftar followed by a spiritual evening and sketches.",
      description:
        "An open table, a warm atmosphere and a full programme: shared iftar, group prayer, poetic nadhra and time together. An evening to enjoy with family or friends during the month of Ramadan.",
      scheduleText: "Fridays during Ramadan, 6:30 pm → 10:00 pm",
    },
    ar: {
      name: "سهرة رمضانية — إفطار ونظرة",
      shortDescription: "إفطار جماعي تليه سهرة روحانية ومشاهد فكاهية.",
      description:
        "مائدة مفتوحة وأجواء دافئة وبرنامج متكامل: إفطار مشترك، صلاة جماعية، نظرة شعرية ولحظات تقاسم. سهرة تُعاش مع العائلة أو الأصدقاء خلال شهر رمضان.",
      scheduleText: "أيام الجمعة في رمضان، 18:30 ← 22:00",
    },
  },
  "scene-ouverte-concert-mensuel": {
    en: {
      name: "Open stage — Monthly concert",
      shortDescription: "One evening a month to discover the platform’s talents.",
      description:
        "Every month, WANTED TUN EVENTS opens its stage: established artists, rising voices from the choir and guest bands. A warm concert, an eclectic line-up and a loyal audience.",
      scheduleText: "One Saturday a month, 8:00 pm → 11:00 pm",
    },
    ar: {
      name: "المسرح المفتوح — حفل شهري",
      shortDescription: "أمسية كل شهر لاكتشاف مواهب المنصة.",
      description:
        "كل شهر تفتح WANTED TUN EVENTS مسرحها: فنانون متمرّسون، ومواهب صاعدة من الكورال، وفرق ضيفة. حفل دافئ وبرمجة متنوعة وجمهور وفيّ.",
      scheduleText: "سبت واحد كل شهر، 20:00 ← 23:00",
    },
  },
  "camp-nature-week-end-bivouac": {
    en: {
      name: "Nature camp — bivouac weekend",
      shortDescription: "Two nights in the wild: campfires, hiking and group activities.",
      description:
        "An unplugged weekend: setting up camp, a sunrise hike, an evening around the campfire, cooperative games and nature workshops. Camping gear and meals are provided by the team.",
      scheduleText: "One weekend a month (Friday 4:00 pm → Sunday 12:00 pm)",
    },
    ar: {
      name: "مخيّم الطبيعة — عطلة نهاية أسبوع للتخييم",
      shortDescription: "ليلتان في الطبيعة: نار المخيّم ومشي جبلي وأنشطة جماعية.",
      description:
        "عطلة بعيدًا عن الشاشات: نصب المخيّم، ومشي عند شروق الشمس، وسهرة حول النار، وألعاب تعاونية وورشات في الطبيعة. معدات التخييم والوجبات يوفّرها الفريق.",
      scheduleText: "عطلة نهاية أسبوع كل شهر (الجمعة 16:00 ← الأحد 12:00)",
    },
  },
};

/** Par nom français de l'offre. */
export const PLAN_TRANSLATIONS: Record<string, Plan> = {
  "Découverte — 4 séances": {
    en: {
      name: "Discovery — 4 sessions",
      description: "Try the choir for a month.",
      scheduleText: "Thursday 6:00 pm → 7:30 pm",
      extraInfo: "One session per month can be rescheduled on request.",
    },
    ar: {
      name: "اكتشاف — 4 حصص",
      description: "لتجربة الكورال لمدة شهر.",
      scheduleText: "الخميس 18:00 ← 19:30",
      extraInfo: "يمكن تأجيل حصة واحدة شهريًا بطلب بسيط.",
    },
  },
  "Programme complet — 12 séances": {
    en: {
      name: "Full programme — 12 sessions",
      description: "The complete cycle, including the end-of-programme concert.",
      scheduleText: "Thursday 6:00 pm → 7:30 pm",
      extraInfo: "Access to the end-of-cycle concert + free vocal exercise booklet.",
    },
    ar: {
      name: "البرنامج الكامل — 12 حصة",
      description: "الدورة الكاملة مع حفل نهاية البرنامج.",
      scheduleText: "الخميس 18:00 ← 19:30",
      extraInfo: "دخول حفل نهاية الدورة + كتيّب تمارين صوتية مجاني.",
    },
  },
  "Formule mensuelle — 4 séances": {
    en: {
      name: "Monthly plan — 4 sessions",
      description: "One month of weekly circles with individual follow-up.",
      scheduleText: "Saturday 10:00 am → 11:30 am",
      extraInfo: "Audio revision material sent after each session.",
    },
    ar: {
      name: "الصيغة الشهرية — 4 حصص",
      description: "شهر من الحلقات الأسبوعية مع متابعة فردية.",
      scheduleText: "السبت 10:00 ← 11:30",
      extraInfo: "تُرسل مادة صوتية للمراجعة بعد كل حصة.",
    },
  },
  "Parcours 10 séances": {
    en: {
      name: "10-session course",
      description: "A memorisation course with a mid-point assessment.",
      scheduleText: "Saturday 10:00 am → 11:30 am",
      extraInfo: "Certificate of completion after the 10 sessions.",
    },
    ar: {
      name: "مسار من 10 حصص",
      description: "مسار حفظ مع تقييم في منتصفه.",
      scheduleText: "السبت 10:00 ← 11:30",
      extraInfo: "شهادة إتمام المسار بعد الحصص العشر.",
    },
  },
  "Pass Iftar — 2 soirées": {
    en: {
      name: "Iftar pass — 2 evenings",
      description: "Two Ramadan evenings of your choice during the month.",
      scheduleText: "Friday 6:30 pm → 10:00 pm",
      extraInfo: "Children’s menu available on request.",
    },
    ar: {
      name: "بطاقة الإفطار — أمسيتان",
      description: "أمسيتان رمضانيتان من اختيارك خلال الشهر.",
      scheduleText: "الجمعة 18:30 ← 22:00",
      extraInfo: "قائمة طعام للأطفال متوفرة عند الطلب.",
    },
  },
  "Abonné scène — 6 concerts": {
    en: {
      name: "Stage member — 6 concerts",
      description: "Six concerts of the season at a reduced price.",
      scheduleText: "Saturday 8:00 pm → 11:00 pm",
      extraInfo: "Reserved category A seat + printed programme.",
    },
    ar: {
      name: "مشترك المسرح — 6 حفلات",
      description: "ست حفلات من الموسم بسعر مخفّض.",
      scheduleText: "السبت 20:00 ← 23:00",
      extraInfo: "مقعد محجوز في الفئة (أ) + برنامج مطبوع.",
    },
  },
  "Week-end bivouac — 1 séjour": {
    en: {
      name: "Bivouac weekend — 1 trip",
      description: "A full supervised weekend, gear and meals included.",
      scheduleText: "Friday 4:00 pm → Sunday 12:00 pm",
      extraInfo: "Equipment list sent 7 days before departure.",
    },
    ar: {
      name: "عطلة التخييم — رحلة واحدة",
      description: "عطلة نهاية أسبوع كاملة ومؤطَّرة، مع المعدات والوجبات.",
      scheduleText: "الجمعة 16:00 ← الأحد 12:00",
      extraInfo: "تُرسل قائمة المعدات قبل 7 أيام من الانطلاق.",
    },
  },
};

/** Titres de séances : traduction à partir du titre français (numéro compris). */
export function sessionTranslations(frenchTitle: string | null): Session {
  if (!frenchTitle) return {};
  const numbered = [
    { pattern: /^Séance (\d+) — technique vocale$/, en: "Session {n} — vocal technique", ar: "الحصة {n} — تقنيات الصوت" },
    { pattern: /^Cercle (\d+) — récitation & tajwid$/, en: "Circle {n} — recitation & tajweed", ar: "الحلقة {n} — التلاوة والتجويد" },
  ];
  for (const { pattern, en, ar } of numbered) {
    const match = pattern.exec(frenchTitle);
    if (match) return { en: { title: en.replace("{n}", match[1]) }, ar: { title: ar.replace("{n}", match[1]) } };
  }
  const fixed: Record<string, Session> = {
    "Iftar & Nadhra — première soirée": { en: { title: "Iftar & Nadhra — first evening" }, ar: { title: "إفطار ونظرة — الأمسية الأولى" } },
    "Iftar & Nadhra — deuxième soirée": { en: { title: "Iftar & Nadhra — second evening" }, ar: { title: "إفطار ونظرة — الأمسية الثانية" } },
    "Scène ouverte — édition printemps": { en: { title: "Open stage — spring edition" }, ar: { title: "المسرح المفتوح — نسخة الربيع" } },
    "Week-end bivouac — Fontainebleau": { en: { title: "Bivouac weekend — Fontainebleau" }, ar: { title: "عطلة التخييم — فونتينبلو" } },
  };
  return fixed[frenchTitle] ?? {};
}
