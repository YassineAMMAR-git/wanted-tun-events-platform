# WANTED TUN EVENTS

Plateforme web de gestion des **cours, ateliers, événements et abonnements** (Next.js App Router + PostgreSQL / Drizzle ORM).

## Comptes de démonstration

> ⚠️ **Développement uniquement.** Ces comptes ne sont **jamais** créés en production : le seed
> n'y installe que l'administrateur défini par `ADMIN_EMAIL` / `ADMIN_PASSWORD` (voir
> « Variables d'environnement »). Ne réutilisez pas ces mots de passe sur un site en ligne.

| Rôle | E-mail | Mot de passe |
| --- | --- | --- |
| Administrateur | `admin@wantedtun.tn` | `Admin2026!` |
| Client | `client@wantedtun.tn` | `Client2026!` |
| Client (paiement en attente) | `youssef@wantedtun.tn` | `Client2026!` |

## Fonctionnalités

### Espace client
- Création de compte avec **confirmation par e-mail** (le compte reste inactif tant que l'adresse n'est pas confirmée), connexion, modification des informations personnelles.
- Liste des activités, filtres par catégorie, recherche.
- Choix d'une offre d'abonnement → **récapitulatif du prix** → **redirection vers le lien de paiement externe** → activation de l'abonnement.
- Suivi visuel des séances : 🟢 séance à venir (allumée) / ⚪ séance réalisée (éteinte).
- Barre de progression, nombre de séances restantes, statut de chaque séance.
- Confirmation / signalement d'absence en un clic (espace personnel **ou** lien reçu par e-mail).

### Interface administrateur (`/admin`)
- **Tableau de bord** : clients, séances, abonnements actifs, paiements en attente, confirmations 🟢🟠🔴.
- **Clients** : création, modification, suppression, fiche complète (abonnements + historique de participation), marquage d'un paiement, activation, prolongation de +30 jours.
- **Activités** : CRUD complet, catégorie, adresse, horaires, durée, tarif, capacité, statut.
- **Séances** : ajout, modification, report, annulation (avec e-mail automatique aux participants), suppression.
- **Abonnements** : CRUD des offres, prix, séances incluses, durée de validité, **lien de paiement externe**, activation/désactivation.
- **Séances > Participants** : suivi 🟢 présence confirmée · 🟠 en attente · 🔴 absence signalée, ajout/retrait manuel d'un participant.
- **Notifications** : règles de déclencheur (modifiables, activables/désactivables) + journal d'envoi des e-mails.

### Notifications automatiques
- **Rappel J-2** : e-mail envoyé 48 h avant chaque séance (date, heure, lieu, activité) avec deux boutons
  *Je confirme ma participation* / *Je ne pourrai pas participer*.
- Déclencheur : `GET /api/cron/reminders` (à appeler par un cron horaire). Protégé par l'en-tête
  `x-cron-secret: $CRON_SECRET` si la variable est définie. Idempotent : une séance ne reçoit qu'une vague de rappels.
- Expiration automatique des abonnements arrivés à échéance.
- Autres déclencheurs prêts : création de compte, activation d'abonnement, annulation/report de séance, fin d'abonnement (désactivé par défaut).

### Comptes et sécurité
- **Sessions** : jeton aléatoire de 256 bits dans un cookie `HttpOnly` / `SameSite=Lax` (`Secure` en production) ; seule son empreinte SHA-256 est stockée (`user_sessions`). Déconnexion et révocation côté serveur.
- **Rôles** : `client` (session de 30 jours) et `admin` (session de 12 heures). Vérification dans chaque page et action (`requireUser` / `requireAdmin`), plus une redirection anticipée dans `src/proxy.ts`.
- **Mots de passe** : scrypt (N=2^15, r=8, p=3) ; politique CNIL (12 caractères, majuscule, minuscule, chiffre, caractère spécial). Les anciens hachages sont mis à niveau à la connexion.
- **Anti force brute** : compte bloqué 15 minutes après 5 échecs ; message identique que l'e-mail existe ou non.
- **Vérification e-mail** : lien à usage unique valable 24 h (`email_verification_tokens`, empreinte uniquement), renvoi limité à un e-mail par minute.
- **Contrôle des saisies** : schémas `zod` côté serveur (`src/lib/validation`) + attributs HTML côté navigateur ; erreurs affichées sous chaque champ.
- Changer de mot de passe, d'e-mail ou de rôle déconnecte les autres appareils.

### Langues (français, anglais, arabe)
- **Français par défaut.** Le bouton 🌐 FR / EN / AR de l'en-tête change la langue (cookie `NEXT_LOCALE`, mêmes URL dans toutes les langues). Pour un utilisateur connecté, la langue choisie devient aussi celle de ses e-mails (`users.locale`).
- **Arabe** : page affichée de droite à gauche (`dir="rtl"`), y compris dans les e-mails.
- **Textes de l'interface** : `src/i18n/messages/fr.ts` (référence), `en.ts`, `ar.ts`. TypeScript signale toute clé manquante ou en trop dans une langue.
- **Contenu** (catégories, activités, offres, séances) : français dans les colonnes habituelles, anglais et arabe dans la colonne JSON `translations`. Dans l'administration, chaque champ traduisible a des onglets Français / English / العربية ; un champ laissé vide affiche le texte français.
- Dates, heures, durées et prix sont formatés selon la langue (`src/lib/format.ts`), toujours en heure de Paris et en euros.
- `npm run content:translate` ajoute les traductions du contenu de démonstration à une base existante.

## Variables d'environnement

Copier `.env.example` vers `.env` puis renseigner les valeurs. Le fichier `.env` est lu par Next.js et par `drizzle.config.ts`.

| Variable | Rôle |
| --- | --- |
| `DATABASE_URL` | Connexion PostgreSQL (obligatoire) |
| `APP_URL` | URL publique utilisée dans les liens des e-mails (confirmation de compte, rappels) |
| `ADMIN_EMAIL` / `ADMIN_PASSWORD` | Premier administrateur, créé au premier démarrage sur une base vide. **Obligatoires en production** : sans eux aucun compte n'est créé (le catalogue l'est) et un message le signale dans les journaux. Facultatifs en développement. |
| `RESEND_API_KEY` | Clé API Resend : envoi réel des e-mails. Vide en développement : e-mails **simulés** (contenu affiché dans le terminal). Vide en production : envois en échec. Test : `npm run email:test -- vous@exemple.fr` |
| `MAIL_FROM` | Expéditeur des e-mails (domaine vérifié dans Resend) |
| `MAIL_REPLY_TO` | Adresse de réponse (facultatif) |
| `CRON_SECRET` | Secret du endpoint de rappels |

## Base de données

`src/db/schema.ts` : `users`, `user_sessions`, `email_verification_tokens`, `categories`, `activities`, `sessions`, `plans`, `subscriptions`, `attendances`, `notifications`, `notification_rules`.

```bash
npx drizzle-kit push   # applique le schéma
npm run build && npm start
```

Les données de démonstration (8 catégories dont 3 « à venir », 5 activités, 7 offres, 22 séances, 3 comptes) sont insérées automatiquement au premier chargement si la base est vide.

## Catégories gérées

1. Concerts et spectacles 🎤
2. Club de chant 🎶
3. Campings ⛺
4. Soirées ramadanesques 🌙
5. Coran 📖
6. Cercles de parole 💬 *(à venir)*
7. Ateliers psychologiques 🧠 *(à venir)*
8. Activités sportives en groupe 🏃 *(à venir)*

## Évolutions prévues (architecture prête)

Paiement intégré, application mobile, SMS / WhatsApp, listes d'attente, réservation, facturation,
statistiques, gestion des intervenants, QR code de pointage, avis clients : le modèle de données et le
moteur de notification sont conçus pour les accueillir sans refonte.
