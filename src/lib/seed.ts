import "server-only";
import { eq, sql } from "drizzle-orm";
import { db } from "@/db";
import {
  activities,
  attendances,
  categories,
  notificationRules,
  plans,
  sessions,
  subscriptions,
  users,
} from "@/db/schema";
import { hashPassword, randomToken } from "@/lib/auth";
import { parseParisDateTime, toDateTimeLocalValue } from "@/lib/format";
import {
  ACTIVITY_TRANSLATIONS,
  CATEGORY_TRANSLATIONS,
  PLAN_TRANSLATIONS,
  sessionTranslations,
} from "@/lib/content-translations";

let seedPromise: Promise<void> | null = null;

/** Exécute le seed une seule fois par instance de serveur. */
export function ensureSeeded(): Promise<void> {
  seedPromise ??= seed().catch((error) => {
    console.error("[seed] échec", error);
    seedPromise = null;
  });
  return seedPromise;
}

type SeedUser = typeof users.$inferInsert;

/**
 * Comptes créés au premier démarrage.
 * — développement : administrateur + deux clients de démonstration (mots de passe documentés).
 * — production : uniquement l'administrateur défini par ADMIN_EMAIL / ADMIN_PASSWORD.
 */
async function seedUsers(): Promise<SeedUser[]> {
  const adminEmail = process.env.ADMIN_EMAIL?.trim().toLowerCase();
  const adminPassword = process.env.ADMIN_PASSWORD;

  if (process.env.NODE_ENV === "production") {
    if (!adminEmail || !adminPassword) {
      console.error(
        "[seed] ADMIN_EMAIL / ADMIN_PASSWORD absents : aucun compte administrateur n'a été créé. " +
          "Renseignez ces variables puis relancez l'application.",
      );
      return [];
    }
    return [
      {
        firstName: "Administrateur",
        lastName: "WANTED TUN",
        email: adminEmail,
        passwordHash: await hashPassword(adminPassword),
        role: "admin",
        emailVerifiedAt: new Date(),
      },
    ];
  }

  return [
    {
      firstName: "Administrateur",
      lastName: "WANTED TUN",
      email: adminEmail ?? "admin@wantedtun.tn",
      phone: "+33 1 23 45 67 89",
      city: "Paris",
      passwordHash: await hashPassword(adminPassword ?? "Admin2026!"),
      role: "admin",
      emailVerifiedAt: new Date(),
    },
    {
      firstName: "Sara",
      lastName: "Ben Salah",
      email: "client@wantedtun.tn",
      phone: "+33 6 12 34 56 78",
      city: "Saint-Denis",
      passwordHash: await hashPassword("Client2026!"),
      role: "client",
      emailVerifiedAt: new Date(),
    },
    {
      firstName: "Youssef",
      lastName: "Trabelsi",
      email: "youssef@wantedtun.tn",
      phone: "+33 7 81 23 45 67",
      city: "Montreuil",
      passwordHash: await hashPassword("Client2026!"),
      role: "client",
      emailVerifiedAt: new Date(),
    },
  ];
}

/** Date située à `daysFromNow` jours d'aujourd'hui, à l'heure donnée (heure de Paris). */
function at(daysFromNow: number, hour: number, minute = 0): Date {
  const [year, month, day] = toDateTimeLocalValue(new Date()).slice(0, 10).split("-").map(Number);
  const target = new Date(Date.UTC(year, month - 1, day + daysFromNow));
  const pad = (value: number) => String(value).padStart(2, "0");
  const local = `${target.getUTCFullYear()}-${pad(target.getUTCMonth() + 1)}-${pad(target.getUTCDate())}T${pad(hour)}:${pad(minute)}`;
  return parseParisDateTime(local)!;
}

async function seed(): Promise<void> {
  const [{ count }] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(categories);
  if (count > 0) return;

  /* ------------------------------ catégories ----------------------------- */
  const categoryRows = await db
    .insert(categories)
    .values(
      [
      {
        name: "Concerts et spectacles",
        slug: "concerts-et-spectacles",
        emoji: "🎤",
        accent: "amber",
        position: 1,
        description: "Scènes ouvertes, concerts live et spectacles organisés par WANTED TUN EVENTS.",
      },
      {
        name: "Club de chant",
        slug: "club-de-chant",
        emoji: "🎶",
        accent: "violet",
        position: 2,
        description: "Ateliers de chant hebdomadaires : technique vocale, répertoire et représentation.",
      },
      {
        name: "Campings",
        slug: "campings",
        emoji: "⛺",
        accent: "emerald",
        position: 3,
        description: "Séjours nature encadrés : bivouacs, feux de camp et activités de groupe.",
      },
      {
        name: "Soirées ramadanesques",
        slug: "soirees-ramadanesques",
        emoji: "🌙",
        accent: "indigo",
        position: 4,
        description: "Iftars collectifs, soirées spirituelles et rencontres pendant le mois de Ramadan.",
      },
      {
        name: "Coran",
        slug: "coran",
        emoji: "📖",
        accent: "teal",
        position: 5,
        description: "Cercles de récitation, mémorisation et tajwid avec des intervenants confirmés.",
      },
      {
        name: "Cercles de parole",
        slug: "cercles-de-parole",
        emoji: "💬",
        accent: "sky",
        position: 6,
        comingSoon: true,
        description: "Espaces d'écoute et d'échange en petits groupes. Ouverture prochaine.",
      },
      {
        name: "Ateliers psychologiques",
        slug: "ateliers-psychologiques",
        emoji: "🧠",
        accent: "rose",
        position: 7,
        comingSoon: true,
        description: "Ateliers animés par des professionnels du bien-être. Ouverture prochaine.",
      },
      {
        name: "Activités sportives en groupe",
        slug: "activites-sportives",
        emoji: "🏃",
        accent: "orange",
        position: 8,
        comingSoon: true,
        description: "Randonnées, courses collectives et défis sportifs. Ouverture prochaine.",
      },
    ].map((category) => ({ ...category, translations: CATEGORY_TRANSLATIONS[category.slug] ?? {} })),
    )
    .returning({ id: categories.id, slug: categories.slug });

  const cat = (slug: string) => categoryRows.find((row) => row.slug === slug)!.id;

  /* ------------------------------- comptes ------------------------------- */
  /*
   * En production, aucun mot de passe n'est écrit en dur : l'administrateur provient de
   * ADMIN_EMAIL / ADMIN_PASSWORD, et les comptes de démonstration ne sont pas créés du tout.
   * Sans ces variables, le catalogue est installé mais aucun compte ne l'est : il faut
   * renseigner les variables puis redémarrer (voir README, « Premier déploiement »).
   */
  const seededUsers = await seedUsers();
  const userRows = seededUsers.length
    ? await db.insert(users).values(seededUsers).returning({ id: users.id, email: users.email })
    : [];

  const clientId = userRows.find((row) => row.email === "client@wantedtun.tn")?.id ?? null;
  const client2Id = userRows.find((row) => row.email === "youssef@wantedtun.tn")?.id ?? null;

  /* ------------------------------ activités ------------------------------ */
  const activityRows = await db
    .insert(activities)
    .values(
      [
      {
        categoryId: cat("club-de-chant"),
        name: "Club de chant — Chorale WANTED",
        slug: "club-de-chant-chorale-wanted",
        shortDescription: "1 séance par semaine pour travailler la voix, l'harmonie et la scène.",
        description:
          "Rejoignez la chorale WANTED TUN EVENTS : échauffements vocaux, technique respiratoire, travail d'harmonie à plusieurs voix et préparation d'un concert de fin de cycle. Tous les niveaux sont acceptés, l'essentiel est la régularité et l'envie de chanter ensemble.",
        address: "Espace culturel Les Voix, 24 rue Oberkampf, 75011",
        city: "Paris",
        scheduleText: "Chaque jeudi, 18h00 → 19h30",
        durationMinutes: 90,
        priceCents: 1500,
        capacity: 25,
        imageUrl:
          "https://images.pexels.com/photos/38996330/pexels-photo-38996330.jpeg?auto=compress&cs=tinysrgb&fit=crop&h=627&w=1200",
      },
      {
        categoryId: cat("coran"),
        name: "Cercle de récitation & mémorisation",
        slug: "cercle-recitation-memorisation",
        shortDescription: "Apprentissage pas à pas avec correction du tajwid, en petit groupe.",
        description:
          "Un cercle hebdomadaire dédié à la mémorisation du Coran et à la maîtrise des règles de récitation. Chaque participant avance à son rythme avec un suivi individuel, une révision collective et des objectifs mensuels.",
        address: "Centre culturel Ennour, 8 rue du Landy, 93200",
        city: "Saint-Denis",
        scheduleText: "Chaque samedi, 10h00 → 11h30",
        durationMinutes: 90,
        priceCents: 1000,
        capacity: 20,
        imageUrl:
          "https://images.pexels.com/photos/8522562/pexels-photo-8522562.jpeg?auto=compress&cs=tinysrgb&fit=crop&h=627&w=1200",
      },
      {
        categoryId: cat("soirees-ramadanesques"),
        name: "Soirée ramadanesque — Iftar & Nadhra",
        slug: "soiree-ramadanesque-iftar-nadhra",
        shortDescription: "Iftar collectif suivi d'une soirée spirituelle et de sketches.",
        description:
          "Une table ouverte, une ambiance chaleureuse et un programme complet : iftar partagé, prière collective, nadhra poétique et moment de partage. Une soirée à vivre en famille ou entre amis pendant le mois de Ramadan.",
        address: "Salle Le Patio, 15 boulevard Paul Vaillant-Couturier, 93100",
        city: "Montreuil",
        scheduleText: "Vendredis de Ramadan, 18h30 → 22h00",
        durationMinutes: 210,
        priceCents: 2500,
        capacity: 120,
        imageUrl:
          "https://images.pexels.com/photos/20488448/pexels-photo-20488448.jpeg?auto=compress&cs=tinysrgb&fit=crop&h=627&w=1200",
      },
      {
        categoryId: cat("concerts-et-spectacles"),
        name: "Scène ouverte — Concert mensuel",
        slug: "scene-ouverte-concert-mensuel",
        shortDescription: "Une soirée par mois pour découvrir les talents de la plateforme.",
        description:
          "Chaque mois, WANTED TUN EVENTS ouvre sa scène : artistes confirmés, révélations de la chorale et groupes invités. Un concert chaleureux, une programmation éclectique et un public fidèle.",
        address: "Salle Le Grand Écho, 30 boulevard de Belleville, 75020",
        city: "Paris",
        scheduleText: "Un samedi par mois, 20h00 → 23h00",
        durationMinutes: 180,
        priceCents: 2000,
        capacity: 200,
        imageUrl:
          "https://images.pexels.com/photos/3727138/pexels-photo-3727138.jpeg?auto=compress&cs=tinysrgb&fit=crop&h=627&w=1200",
      },
      {
        categoryId: cat("campings"),
        name: "Camp nature — week-end bivouac",
        slug: "camp-nature-week-end-bivouac",
        shortDescription: "2 nuits en pleine nature, feux de camp, randonnée et activités de groupe.",
        description:
          "Un week-end déconnecté : installation du bivouac, randonnée au lever du soleil, veillée autour du feu de camp, jeux coopératifs et ateliers nature. Matériel de camping et repas pris en charge par l'équipe.",
        address: "Forêt de Fontainebleau — départ parking de la Croix de Franchard, 77300",
        city: "Fontainebleau",
        scheduleText: "Un week-end par mois (vendredi 16h → dimanche 12h)",
        durationMinutes: 2880,
        priceCents: 12000,
        capacity: 40,
        imageUrl:
          "https://images.pexels.com/photos/12372756/pexels-photo-12372756.jpeg?auto=compress&cs=tinysrgb&fit=crop&h=627&w=1200",
      },
    ].map((activity) => ({ ...activity, translations: ACTIVITY_TRANSLATIONS[activity.slug] ?? {} })),
    )
    .returning({ id: activities.id, slug: activities.slug, name: activities.name });

  const act = (slug: string) => activityRows.find((row) => row.slug === slug)!;

  /* ----------------------------- abonnements ----------------------------- */
  const planRows = await db
    .insert(plans)
    .values(
      [
      {
        activityId: act("club-de-chant-chorale-wanted").id,
        name: "Découverte — 4 séances",
        description: "Pour tester la chorale pendant un mois.",
        priceCents: 5000,
        sessionsIncluded: 4,
        validityDays: 45,
        address: "Espace culturel Les Voix, 24 rue Oberkampf, 75011 Paris",
        scheduleText: "Jeudi 18h00 → 19h30",
        extraInfo: "Report possible d'une séance par mois sur simple demande.",
        paymentUrl: "https://buy.stripe.com/test_wanted_tun_choeur_4seances",
      },
      {
        activityId: act("club-de-chant-chorale-wanted").id,
        name: "Programme complet — 12 séances",
        description: "Le cycle complet avec concert de fin de programme inclus.",
        priceCents: 14000,
        sessionsIncluded: 12,
        validityDays: 120,
        address: "Espace culturel Les Voix, 24 rue Oberkampf, 75011 Paris",
        scheduleText: "Jeudi 18h00 → 19h30",
        extraInfo: "Accès au concert de fin de cycle + fichier d'exercices vocaux offert.",
        paymentUrl: "https://buy.stripe.com/test_wanted_tun_choeur_12seances",
      },
      {
        activityId: act("cercle-recitation-memorisation").id,
        name: "Formule mensuelle — 4 séances",
        description: "Un mois de cercle hebdomadaire avec suivi individuel.",
        priceCents: 3500,
        sessionsIncluded: 4,
        validityDays: 35,
        address: "Centre culturel Ennour, 8 rue du Landy, 93200 Saint-Denis",
        scheduleText: "Samedi 10h00 → 11h30",
        extraInfo: "Support audio de révision envoyé après chaque séance.",
        paymentUrl: "https://buy.stripe.com/test_wanted_tun_coran_mensuel",
      },
      {
        activityId: act("cercle-recitation-memorisation").id,
        name: "Parcours 10 séances",
        description: "Un parcours de mémorisation avec évaluation intermédiaire.",
        priceCents: 8000,
        sessionsIncluded: 10,
        validityDays: 90,
        address: "Centre culturel Ennour, 8 rue du Landy, 93200 Saint-Denis",
        scheduleText: "Samedi 10h00 → 11h30",
        extraInfo: "Attestation de parcours à la fin des 10 séances.",
        paymentUrl: "https://buy.stripe.com/test_wanted_tun_coran_parcours",
      },
      {
        activityId: act("soiree-ramadanesque-iftar-nadhra").id,
        name: "Pass Iftar — 2 soirées",
        description: "Deux soirées ramadanesques au choix pendant le mois.",
        priceCents: 4500,
        sessionsIncluded: 2,
        validityDays: 30,
        address: "Salle Le Patio, 15 boulevard Paul Vaillant-Couturier, 93100 Montreuil",
        scheduleText: "Vendredi 18h30 → 22h00",
        extraInfo: "Menu enfant disponible sur demande.",
        paymentUrl: "https://buy.stripe.com/test_wanted_tun_ramadan_pass2",
      },
      {
        activityId: act("scene-ouverte-concert-mensuel").id,
        name: "Abonné scène — 6 concerts",
        description: "Six concerts de la saison à tarif réduit.",
        priceCents: 10000,
        sessionsIncluded: 6,
        validityDays: 180,
        address: "Salle Le Grand Écho, 30 boulevard de Belleville, 75020 Paris",
        scheduleText: "Samedi 20h00 → 23h00",
        extraInfo: "Place réservée en catégorie A + programme imprimé.",
        paymentUrl: "https://buy.stripe.com/test_wanted_tun_scene_6concerts",
      },
      {
        activityId: act("camp-nature-week-end-bivouac").id,
        name: "Week-end bivouac — 1 séjour",
        description: "Un week-end complet encadré, matériel et repas inclus.",
        priceCents: 12000,
        sessionsIncluded: 1,
        validityDays: 60,
        address: "Forêt de Fontainebleau — rendez-vous au parking de la Croix de Franchard, 77300 Fontainebleau",
        scheduleText: "Vendredi 16h00 → Dimanche 12h00",
        extraInfo: "Liste du matériel envoyée 7 jours avant le départ.",
        paymentUrl: "https://buy.stripe.com/test_wanted_tun_camping_weekend",
      },
    ].map((plan) => ({ ...plan, translations: PLAN_TRANSLATIONS[plan.name] ?? {} })),
    )
    .returning({ id: plans.id, activityId: plans.activityId, name: plans.name });

  /* -------------------------------- séances ------------------------------ */
  type SeedSession = {
    key: string;
    activityId: number;
    title: string;
    startsAt: Date;
    duration: number;
    location: string;
  };

  const seedSessions: SeedSession[] = [];
  const addSeries = (
    slug: string,
    weekdayHours: { offset: number; hour: number; minute?: number },
    count: number,
    location: string,
    duration: number,
    label: (index: number) => string,
  ) => {
    const activity = act(slug);
    for (let index = 0; index < count; index += 1) {
      const offset = weekdayHours.offset + index * 7;
      seedSessions.push({
        key: `${slug}-${index}`,
        activityId: activity.id,
        title: label(index + 1),
        startsAt: at(offset, weekdayHours.hour, weekdayHours.minute ?? 0),
        duration,
        location,
      });
    }
  };

  addSeries(
    "club-de-chant-chorale-wanted",
    { offset: -2, hour: 18, minute: 0 },
    10,
    "Espace culturel Les Voix, Paris 11e",
    90,
    (index) => `Séance ${index} — technique vocale`,
  );
  addSeries(
    "cercle-recitation-memorisation",
    { offset: -1, hour: 10, minute: 0 },
    8,
    "Centre culturel Ennour, Saint-Denis",
    90,
    (index) => `Cercle ${index} — récitation & tajwid`,
  );
  seedSessions.push({
    key: "ramadan-1",
    activityId: act("soiree-ramadanesque-iftar-nadhra").id,
    title: "Iftar & Nadhra — première soirée",
    startsAt: at(6, 18, 30),
    duration: 210,
    location: "Salle Le Patio, Montreuil",
  });
  seedSessions.push({
    key: "ramadan-2",
    activityId: act("soiree-ramadanesque-iftar-nadhra").id,
    title: "Iftar & Nadhra — deuxième soirée",
    startsAt: at(13, 18, 30),
    duration: 210,
    location: "Salle Le Patio, Montreuil",
  });
  seedSessions.push({
    key: "concert-1",
    activityId: act("scene-ouverte-concert-mensuel").id,
    title: "Scène ouverte — édition printemps",
    startsAt: at(9, 20, 0),
    duration: 180,
    location: "Salle Le Grand Écho, Paris 20e",
  });
  seedSessions.push({
    key: "camping-1",
    activityId: act("camp-nature-week-end-bivouac").id,
    title: "Week-end bivouac — Fontainebleau",
    startsAt: at(20, 16, 0),
    duration: 2880,
    location: "Forêt de Fontainebleau",
  });

  const sessionRows = await db
    .insert(sessions)
    .values(
      seedSessions.map((item) => ({
        activityId: item.activityId,
        title: item.title,
        startsAt: item.startsAt,
        durationMinutes: item.duration,
        location: item.location,
        status: "scheduled",
        translations: sessionTranslations(item.title),
      })),
    )
    .returning({ id: sessions.id, activityId: sessions.activityId, startsAt: sessions.startsAt });

  /* --------------------------- abonnements clients ------------------------ */
  // Abonnements et participations de démonstration : seulement si les clients ont été créés
  // (donc jamais en production, où seul l'administrateur est installé).
  if (clientId && client2Id) {
    const choeurPlan = planRows.find((row) => row.name.startsWith("Programme complet"))!;
    const coranPlan = planRows.find((row) => row.name.startsWith("Formule mensuelle"))!;
    const choeurActivity = act("club-de-chant-chorale-wanted");
    const coranActivity = act("cercle-recitation-memorisation");

    const subscriptionRows = await db
      .insert(subscriptions)
      .values([
        {
          userId: clientId,
          planId: choeurPlan.id,
          activityId: choeurActivity.id,
          status: "active",
          paymentStatus: "paid",
          paymentReference: "WTE-2026-0001",
          startsAt: at(-14, 0, 0),
          endsAt: at(70, 0, 0),
          sessionsIncluded: 12,
          sessionsUsed: 2,
        },
        {
          userId: client2Id,
          planId: coranPlan.id,
          activityId: coranActivity.id,
          status: "active",
          paymentStatus: "paid",
          paymentReference: "WTE-2026-0002",
          startsAt: at(-7, 0, 0),
          endsAt: at(28, 0, 0),
          sessionsIncluded: 4,
          sessionsUsed: 1,
        },
        {
          userId: client2Id,
          planId: choeurPlan.id,
          activityId: choeurActivity.id,
          status: "pending",
          paymentStatus: "pending",
          startsAt: at(0, 0, 0),
          endsAt: at(45, 0, 0),
          sessionsIncluded: 4,
          sessionsUsed: 0,
        },
      ])
      .returning({ id: subscriptions.id, userId: subscriptions.userId, activityId: subscriptions.activityId });

    const demoSubscription = subscriptionRows[0];
    const choeurSessions = sessionRows.filter((row) => row.activityId === choeurActivity.id);

    const ramadanActivityId = act("soiree-ramadanesque-iftar-nadhra").id;
    const ramadanSubscription = subscriptionRows.find((row) => row.activityId === ramadanActivityId) ?? null;

    await db.insert(attendances).values(
      sessionRows.map((session) => {
        if (session.activityId === choeurActivity.id) {
          return {
            sessionId: session.id,
            userId: clientId,
            subscriptionId: demoSubscription.id,
            status: "pending",
            token: randomToken(),
          };
        }
        const subscription =
          subscriptionRows.find((row) => row.activityId === session.activityId && row.userId === client2Id) ??
          ramadanSubscription;
        return {
          sessionId: session.id,
          userId: client2Id,
          subscriptionId: subscription?.id ?? null,
          status: "pending",
          token: randomToken(),
        };
      }),
    );

    // Le client de démonstration a déjà confirmé ses deux premières séances passées.
    const pastChoeur = choeurSessions
      .filter((session) => session.startsAt.getTime() < Date.now())
      .slice(0, 2)
      .map((session) => session.id);
    if (pastChoeur.length > 0) {
      await db
        .update(attendances)
        .set({ status: "confirmed", respondedAt: new Date(), responseChannel: "email" })
        .where(
          sql`${attendances.sessionId} in (${sql.join(
            pastChoeur.map((id) => sql`${id}`),
            sql`, `,
          )}) and ${attendances.userId} = ${clientId}`,
        );
    }
  }

  /* ------------------------- règles de notification ----------------------- */
  await db.insert(notificationRules).values([
    {
      type: "reminder_48h",
      label: "Rappel J-2 + demande de confirmation",
      description:
        "E-mail automatique envoyé 48 heures avant chaque séance : date, heure, lieu et boutons de confirmation de participation.",
      offsetHours: 48,
      channel: "email",
      isEnabled: true,
    },
    {
      type: "subscription_activated",
      label: "Confirmation d'activation d'abonnement",
      description: "E-mail envoyé au client dès que son abonnement est activé après paiement.",
      offsetHours: 0,
      channel: "email",
      isEnabled: true,
    },
    {
      type: "session_cancelled",
      label: "Annulation ou report de séance",
      description: "Prévient les participants lorsqu'une séance est annulée ou reportée.",
      offsetHours: 0,
      channel: "email",
      isEnabled: true,
    },
    {
      type: "subscription_ending",
      label: "Fin prochaine d'un abonnement",
      description: "Rappel envoyé 7 jours avant l'expiration d'un abonnement actif.",
      offsetHours: 168,
      channel: "email",
      isEnabled: false,
    },
  ]);

  await db
    .update(activities)
    .set({ status: "active" })
    .where(eq(activities.status, "active"));
}
