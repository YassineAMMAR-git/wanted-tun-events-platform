# WANTED TUN EVENTS

Plateforme web de billetterie et de gestion d'activités : événements uniques (concerts, soirées…), activités à séances (cours, clubs…), abonnements, paiement en ligne et rappels automatiques.

Next.js (App Router) · PostgreSQL / Drizzle ORM · Mollie (paiement) · Resend (e-mails) · français, anglais, arabe.

## Fonctionnalités

### Côté client
- Création de compte avec confirmation par e-mail, connexion, profil.
- Liste des activités : événements ouverts et à venir en premier, événements passés en historique.
- **Événement unique** : achat d'un billet, avec choix du tarif s'il y en a plusieurs (ex. Chaises, Gradin).
- **Activité à séances** : paiement à la séance ou par abonnement.
- Paiement sur la page sécurisée Mollie, activation automatique dès le paiement confirmé.
- Réservation sur une billetterie externe quand l'événement en a une.
- Espace personnel : billets, abonnements, séances à venir et passées, confirmation de présence.

### Administration (`/admin`)
- Tableau de bord, clients (fiche, export Excel), catégories, carrousel d'accueil.
- Activités : type (événement unique ou activité à séances), dates, prix et tarifs, capacité, photo, lien de billetterie externe.
- Séances : planification, report, annulation avec e-mail aux participants, suivi des présences.
- Abonnements : formules des activités à séances.
- Paiements : état de la connexion Mollie et derniers paiements.
- Notifications : règles de rappel et journal des e-mails envoyés.

### Automatismes
Une tâche quotidienne (`/api/cron/reminders`) envoie les rappels avant chaque séance, fait expirer les abonnements arrivés à échéance, rattrape les paiements dont la confirmation aurait été manquée et supprime les photos inutilisées.

## Installation

```bash
npm install
cp .env.example .env      # puis renseigner les valeurs
npx drizzle-kit push      # crée ou met à jour les tables
npm run dev
```

Sur une base vide, un catalogue de démonstration est créé au premier chargement. Les comptes de démonstration ne sont créés qu'en développement, jamais en production.

## Variables d'environnement

| Variable | Rôle |
| --- | --- |
| `DATABASE_URL` | Connexion PostgreSQL (obligatoire) |
| `APP_URL` | Adresse publique du site : liens des e-mails, retour après paiement, webhook Mollie |
| `ADMIN_EMAIL` / `ADMIN_PASSWORD` | Premier administrateur, créé au premier démarrage sur une base vide. Obligatoires en production |
| `MOLLIE_API_KEY` | Clé d'API Mollie (`test_…` ou `live_…`). Vide : paiement manuel validé par l'administration |
| `RESEND_API_KEY` | Envoi des e-mails. Vide en développement : e-mails simulés dans le terminal |
| `MAIL_FROM` / `MAIL_REPLY_TO` | Expéditeur et adresse de réponse des e-mails |
| `CRON_SECRET` | Secret de la tâche quotidienne. Obligatoire en production : sans lui la tâche est refusée |

Ne jamais commiter le fichier `.env` : il est ignoré par git.

## Déploiement (Vercel + Neon)

1. **Base** : créer un projet Neon et récupérer sa chaîne de connexion.
2. **Schéma** : `DATABASE_URL="<url Neon>" npx drizzle-kit push`. Il n'y a pas de fichiers de migration : cette commande est à relancer à chaque changement de `src/db/schema.ts`, avant de déployer le code.
3. **Variables** : les renseigner dans Vercel (*Settings → Environment Variables*), puis redéployer.
4. **Tâche quotidienne** : déclarée dans `vercel.json`. Vercel l'appelle avec `CRON_SECRET`.
5. **Paiement** : aucun webhook à déclarer chez Mollie, son adresse est transmise avec chaque paiement.

### Mettre en ligne une modification

```bash
npm run save -- "message du commit"
```

Le script vérifie les types et le lint, refuse de publier un fichier sensible, commite puis pousse. Chaque push sur `main` déclenche un déploiement Vercel.

## Organisation du code

| Dossier | Contenu |
| --- | --- |
| `src/app` | Pages publiques, espace personnel, administration, routes d'API |
| `src/app/actions` | Actions serveur (inscription, achat, administration) |
| `src/db/schema.ts` | Modèle de données |
| `src/lib` | Logique métier : authentification, paiements, abonnements, rappels, e-mails |
| `src/i18n/messages` | Textes de l'interface (`fr.ts` sert de référence, `en.ts`, `ar.ts`) |
