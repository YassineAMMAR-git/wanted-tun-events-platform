import type { Metadata } from "next";
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { LegalField, LegalPage, LegalSection } from "@/components/legal-page";
import { LOCALE_COOKIE } from "@/i18n/config";
import { SESSION_COOKIE_NAME } from "@/lib/auth/constants";
import { NOTIFICATION_LOG_RETENTION_DAYS, UNVERIFIED_ACCOUNT_RETENTION_DAYS } from "@/lib/privacy";
import { CONTACT_EMAIL, HOSTING_PROVIDER, PUBLISHER } from "@/lib/site";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("legal");
  return { title: `${t("privacy")} — ${PUBLISHER.name}` };
}

/** Politique de confidentialité (RGPD art. 12 à 14, loi Informatique et Libertés, art. 82 pour les cookies). */
export default async function PrivacyPolicyPage() {
  const t = await getTranslations("legal");
  const mail = <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>;

  return (
    <LegalPage title={t("privacy")}>
      <p>
        {PUBLISHER.name} accorde une grande importance à la protection de vos données personnelles. Cette politique
        vous explique, simplement, quelles données nous collectons, pourquoi, combien de temps nous les gardons, à
        qui elles sont transmises et comment exercer vos droits. Elle respecte le Règlement général sur la
        protection des données (RGPD, règlement UE 2016/679) et la loi n° 78-17 du 6 janvier 1978 dite
        « Informatique et Libertés ».
      </p>
      <p className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-emerald-800">
        <strong>En bref :</strong> nous ne collectons que ce qui est nécessaire pour gérer votre compte, vos
        réservations et vos séances. Nous ne vendons jamais vos données, nous ne faisons pas de publicité ciblée
        et nous n’utilisons aucun cookie publicitaire ou de mesure d’audience.
      </p>

      <LegalSection id="responsable" title="1. Responsable du traitement">
        <p>Le responsable du traitement de vos données est :</p>
        <ul>
          <li>
            <strong className="text-zinc-900">{PUBLISHER.name}</strong>
            {PUBLISHER.legalForm ? `, ${PUBLISHER.legalForm}` : ""}
          </li>
          <LegalField label="Adresse" value={PUBLISHER.address} />
          <LegalField label="Immatriculation" value={PUBLISHER.registration} />
          <li>
            <strong className="text-zinc-900">Contact pour vos données :</strong> {mail}
          </li>
        </ul>
      </LegalSection>

      <LegalSection id="donnees" title="2. Données que nous collectons">
        <ul>
          <li>
            <strong className="text-zinc-900">Compte :</strong> prénom, nom, adresse e-mail, mot de passe (stocké
            uniquement sous forme chiffrée irréversible), langue préférée ; téléphone et ville si vous choisissez
            de les indiquer.
          </li>
          <li>
            <strong className="text-zinc-900">Réservations :</strong> abonnements et billets commandés, montants,
            statut et référence du paiement, séances, confirmations de présence et présences.
          </li>
          <li>
            <strong className="text-zinc-900">Paiement :</strong> vos données bancaires sont saisies directement
            chez notre prestataire de paiement Mollie. <strong>Nous n’y avons jamais accès</strong> et ne les
            conservons pas.
          </li>
          <li>
            <strong className="text-zinc-900">Données techniques :</strong> adresse IP et type de navigateur lors
            de la connexion (sécurité du compte), date d’acceptation de nos conditions.
          </li>
          <li>
            <strong className="text-zinc-900">Échanges :</strong> e-mails que nous vous envoyons (confirmation de
            compte, rappels de séances, paiements) et messages que vous nous adressez.
          </li>
        </ul>
        <p>
          Les champs marqués d’un astérisque (*) sont nécessaires pour créer votre compte ; sans eux, nous ne
          pouvons pas vous inscrire. Nous ne collectons aucune donnée dite « sensible » (santé, opinions, origine…).
        </p>
      </LegalSection>

      <LegalSection id="finalites" title="3. Pourquoi nous les utilisons (finalités et bases légales)">
        <div className="scroll-x">
          <table>
            <thead>
              <tr>
                <th>Finalité</th>
                <th>Base légale (RGPD art. 6)</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>Créer et gérer votre compte et votre espace personnel</td>
                <td>Exécution du contrat (conditions générales)</td>
              </tr>
              <tr>
                <td>Gérer vos réservations, abonnements, billets et paiements</td>
                <td>Exécution du contrat</td>
              </tr>
              <tr>
                <td>Vous envoyer les e-mails de service : confirmation de compte, rappels de séances, suivi des paiements</td>
                <td>Exécution du contrat</td>
              </tr>
              <tr>
                <td>Sécuriser le site et votre compte (blocage après plusieurs échecs de connexion, lutte contre la fraude)</td>
                <td>Intérêt légitime : protéger nos utilisateurs et notre service</td>
              </tr>
              <tr>
                <td>Tenir notre comptabilité et répondre à nos obligations fiscales</td>
                <td>Obligation légale</td>
              </tr>
              <tr>
                <td>Répondre à vos questions et à vos demandes d’exercice de droits</td>
                <td>Intérêt légitime / obligation légale</td>
              </tr>
            </tbody>
          </table>
        </div>
        <p>
          Nous n’envoyons pas de prospection commerciale (newsletter, publicité) et ne prenons aucune décision
          automatisée produisant des effets juridiques à votre égard.
        </p>
      </LegalSection>

      <LegalSection id="destinataires" title="4. Qui reçoit vos données">
        <p>
          Vos données sont accessibles uniquement aux membres habilités de l’équipe {PUBLISHER.name}, pour
          l’organisation des activités. Elles ne sont <strong>jamais vendues ni louées</strong>. Nous faisons appel
          aux prestataires (sous-traitants) suivants, liés par contrat et tenus à la confidentialité :
        </p>
        <ul>
          <li>
            <strong className="text-zinc-900">{HOSTING_PROVIDER.name}</strong> — hébergement du site ; traitements
            exécutés dans un centre de données à Francfort (Allemagne).
          </li>
          <li>
            <strong className="text-zinc-900">Neon</strong> — base de données, hébergée dans l’Union européenne
            (Francfort, Allemagne).
          </li>
          <li>
            <strong className="text-zinc-900">Resend</strong> — envoi des e-mails de service.
          </li>
          <li>
            <strong className="text-zinc-900">Mollie B.V.</strong> (Amsterdam, Pays-Bas) — paiement en ligne. Mollie
            traite vos données bancaires en tant que responsable de traitement distinct, selon sa propre politique
            de confidentialité.
          </li>
        </ul>
        <p>
          Nous pouvons aussi être tenus de communiquer des données aux autorités, sur demande légalement fondée.
        </p>
      </LegalSection>

      <LegalSection id="transferts" title="5. Transferts hors de l’Union européenne">
        <p>
          Nos données sont stockées dans l’Union européenne. Certains prestataires (Vercel, Resend) sont des sociétés
          établies aux États-Unis qui peuvent accéder aux données pour fournir leur service. Ces transferts sont
          encadrés par les clauses contractuelles types de la Commission européenne et, le cas échéant, par le
          cadre de protection des données UE–États-Unis (Data Privacy Framework). Vous pouvez obtenir une copie de
          ces garanties en nous écrivant à {mail}.
        </p>
      </LegalSection>

      <LegalSection id="conservation" title="6. Combien de temps nous les gardons">
        <div className="scroll-x">
          <table>
            <thead>
              <tr>
                <th>Données</th>
                <th>Durée de conservation</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>Compte et espace personnel</td>
                <td>Tant que votre compte existe ; vous pouvez le supprimer à tout moment depuis « Mes informations ».</td>
              </tr>
              <tr>
                <td>Compte créé mais jamais activé (e-mail non confirmé), sans commande</td>
                <td>Supprimé automatiquement après {UNVERIFIED_ACCOUNT_RETENTION_DAYS} jours.</td>
              </tr>
              <tr>
                <td>Commandes et paiements (pièces comptables)</td>
                <td>
                  10 ans (Code de commerce, art. L123-22). Si vous supprimez votre compte, ces pièces sont conservées
                  sous forme anonymisée.
                </td>
              </tr>
              <tr>
                <td>Sessions de connexion (adresse IP, navigateur)</td>
                <td>Jusqu’à la déconnexion, au plus 30 jours ; supprimées automatiquement ensuite.</td>
              </tr>
              <tr>
                <td>Liens de confirmation et de réinitialisation du mot de passe</td>
                <td>24 heures et 1 heure ; supprimés automatiquement après expiration.</td>
              </tr>
              <tr>
                <td>Historique des e-mails envoyés</td>
                <td>{Math.round(NOTIFICATION_LOG_RETENTION_DAYS / 30)} mois, puis supprimé automatiquement.</td>
              </tr>
              <tr>
                <td>Preuve d’acceptation des conditions</td>
                <td>Tant que votre compte existe.</td>
              </tr>
            </tbody>
          </table>
        </div>
      </LegalSection>

      <LegalSection id="droits" title="7. Vos droits">
        <p>Vous disposez à tout moment des droits suivants sur vos données :</p>
        <ul>
          <li><strong className="text-zinc-900">Accès</strong> : savoir quelles données nous détenons et en obtenir une copie ;</li>
          <li><strong className="text-zinc-900">Rectification</strong> : corriger des données inexactes ;</li>
          <li><strong className="text-zinc-900">Effacement</strong> : supprimer votre compte et vos données ;</li>
          <li><strong className="text-zinc-900">Portabilité</strong> : récupérer vos données dans un format lisible par une machine ;</li>
          <li><strong className="text-zinc-900">Opposition</strong> et <strong className="text-zinc-900">limitation</strong> du traitement, pour des raisons tenant à votre situation ;</li>
          <li>
            <strong className="text-zinc-900">Directives post-mortem</strong> : définir ce que deviennent vos données
            après votre décès (loi Informatique et Libertés, art. 85).
          </li>
        </ul>
        <p>
          <strong className="text-zinc-900">Directement depuis votre espace :</strong> la page{" "}
          <Link href="/espace-personnel/profil">Mes informations</Link> vous permet de modifier vos données, de{" "}
          <strong>télécharger toutes vos données</strong> et de <strong>supprimer votre compte</strong>.
        </p>
        <p>
          Pour toute autre demande, écrivez-nous à {mail}. Nous répondons dans un délai d’un mois. En cas de doute
          raisonnable sur votre identité, nous pourrons vous demander un justificatif.
        </p>
        <p>
          Si vous estimez que vos droits ne sont pas respectés, vous pouvez adresser une réclamation à la{" "}
          <strong className="text-zinc-900">CNIL</strong> (Commission nationale de l’informatique et des libertés),
          3 place de Fontenoy, TSA 80715, 75334 Paris Cedex 07 —{" "}
          <a href="https://www.cnil.fr/fr/plaintes" target="_blank" rel="noopener noreferrer">
            www.cnil.fr/fr/plaintes
          </a>
          .
        </p>
      </LegalSection>

      <LegalSection id="cookies" title="8. Cookies">
        <p>
          Le site utilise uniquement des cookies <strong>strictement nécessaires</strong> à son fonctionnement. Ils
          sont dispensés de consentement (loi Informatique et Libertés, art. 82 ; lignes directrices de la CNIL) :
          c’est pourquoi aucun bandeau de cookies ne vous est présenté. Nous n’utilisons{" "}
          <strong>aucun cookie publicitaire, de mesure d’audience ou de réseau social</strong>.
        </p>
        <div className="scroll-x">
          <table>
            <thead>
              <tr>
                <th>Cookie</th>
                <th>Rôle</th>
                <th>Durée</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>
                  <code>{SESSION_COOKIE_NAME}</code>
                </td>
                <td>Vous garder connecté(e) de façon sécurisée (inaccessible aux scripts, transmis uniquement en HTTPS).</td>
                <td>30 jours au plus (12 heures pour l’administration), supprimé à la déconnexion</td>
              </tr>
              <tr>
                <td>
                  <code>{LOCALE_COOKIE}</code>
                </td>
                <td>Mémoriser la langue que vous avez choisie.</td>
                <td>12 mois</td>
              </tr>
            </tbody>
          </table>
        </div>
        <p>
          Certaines photos peuvent être chargées depuis des banques d’images externes, qui reçoivent alors votre
          adresse IP comme pour toute image affichée sur le web. Les liens vers Instagram et Facebook ne chargent
          rien tant que vous ne cliquez pas dessus.
        </p>
      </LegalSection>

      <LegalSection id="securite" title="9. Sécurité">
        <p>Nous mettons en œuvre des mesures adaptées pour protéger vos données, notamment :</p>
        <ul>
          <li>connexion chiffrée (HTTPS) imposée sur tout le site ;</li>
          <li>mots de passe chiffrés de façon irréversible (algorithme scrypt), jamais stockés en clair ;</li>
          <li>blocage temporaire du compte après plusieurs tentatives de connexion échouées ;</li>
          <li>un compte n’est ouvert que sur un seul appareil à la fois ; changer de mot de passe déconnecte les autres appareils ;</li>
          <li>accès aux données réservé aux administrateurs authentifiés ;</li>
          <li>données bancaires traitées uniquement par Mollie, prestataire de paiement agréé.</li>
        </ul>
        <p>
          En cas de violation de données présentant un risque pour vous, nous en informerons la CNIL et, si
          nécessaire, les personnes concernées, dans les conditions prévues par le RGPD (art. 33 et 34).
        </p>
      </LegalSection>

      <LegalSection id="mineurs" title="10. Mineurs">
        <p>
          Les personnes de moins de 15 ans ne peuvent créer un compte qu’avec l’accord de leur représentant légal
          (loi Informatique et Libertés, art. 45). Si vous pensez qu’un mineur nous a transmis des données sans
          cet accord, contactez-nous : nous les supprimerons.
        </p>
      </LegalSection>

      <LegalSection id="modifications" title="11. Modifications de cette politique">
        <p>
          Nous pouvons faire évoluer cette politique, par exemple si nous ajoutons un service. La date de mise à jour
          figure en haut de la page. En cas de changement important, nous vous en informerons par e-mail ou sur le
          site avant son entrée en vigueur.
        </p>
      </LegalSection>
    </LegalPage>
  );
}
