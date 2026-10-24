import type { Metadata } from "next";
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { LegalPage, LegalSection } from "@/components/legal-page";
import { CONFIRMATION_CLOSE_HOURS } from "@/lib/attendance";
import { CONSUMER_MEDIATOR, CONTACT_EMAIL, PUBLISHER } from "@/lib/site";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("legal");
  return { title: `${t("terms")} — ${PUBLISHER.name}` };
}

/**
 * Conditions générales d'utilisation et de vente (Code de la consommation, art. L111-1, L221-5 et L221-28 12°).
 * Elles décrivent le fonctionnement réel de la plateforme : à mettre à jour si les règles de réservation changent.
 */
export default async function TermsPage() {
  const t = await getTranslations("legal");
  const mail = <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>;

  return (
    <LegalPage title={t("terms")}>
      <p>
        Les présentes conditions générales d’utilisation et de vente (« CGU-CGV ») encadrent l’utilisation du site{" "}
        {PUBLISHER.name} et l’achat de billets, de séances et d’abonnements aux activités proposées. En créant un
        compte, vous les acceptez. Les coordonnées de l’organisateur figurent dans les{" "}
        <Link href="/mentions-legales">mentions légales</Link>.
      </p>

      <LegalSection id="compte" title="1. Compte client">
        <ul>
          <li>La création d’un compte est gratuite. Elle est nécessaire pour réserver et suivre vos séances.</li>
          <li>
            Vous devez être majeur(e), ou disposer de l’accord de votre représentant légal, et fournir des
            informations exactes. Le compte est activé après confirmation de votre adresse e-mail.
          </li>
          <li>
            Votre mot de passe est personnel et confidentiel. Votre compte n’est ouvert que sur un appareil à la fois.
            Prévenez-nous immédiatement de toute utilisation non autorisée.
          </li>
          <li>
            Vous pouvez supprimer votre compte à tout moment depuis{" "}
            <Link href="/espace-personnel/profil">Mes informations</Link>. Nous pouvons suspendre un compte en cas
            d’utilisation frauduleuse ou contraire aux présentes conditions.
          </li>
        </ul>
      </LegalSection>

      <LegalSection id="offres" title="2. Activités et offres">
        <ul>
          <li>
            <strong className="text-zinc-900">Événements uniques</strong> (concert, soirée, sortie…) : vous achetez un
            billet pour une date, éventuellement selon plusieurs tarifs.
          </li>
          <li>
            <strong className="text-zinc-900">Activités à séances</strong> (cours, ateliers, club…) : vous achetez une
            séance à l’unité ou un abonnement comprenant un nombre de séances, utilisable pendant la durée indiquée sur
            l’offre.
          </li>
        </ul>
        <p>
          Les caractéristiques essentielles de chaque offre (contenu, lieu, dates, durée, nombre de séances, prix)
          sont présentées sur sa page avant la commande. Certaines activités sont vendues par une billetterie
          partenaire : l’achat se fait alors sur son site, selon ses propres conditions.
        </p>
      </LegalSection>

      <LegalSection id="prix" title="3. Prix et paiement">
        <ul>
          <li>Les prix sont indiqués en euros, toutes taxes comprises. Le prix applicable est celui affiché au moment de la commande.</li>
          <li>
            Une promotion peut être réservée à certains clients (par exemple ceux qui ont déjà souscrit une autre
            formule) : le prix réduit est alors affiché avant le paiement.
          </li>
          <li>
            Le paiement s’effectue en ligne via notre prestataire sécurisé Mollie, ou selon le moyen de paiement
            indiqué sur la page de paiement. Nous n’avons jamais accès à vos données bancaires.
          </li>
          <li>
            La commande est définitive à réception du paiement : votre billet ou votre abonnement est alors activé et
            apparaît dans votre espace personnel. Une commande non payée peut être annulée par vous à tout moment.
          </li>
        </ul>
      </LegalSection>

      <LegalSection id="retractation" title="4. Droit de rétractation">
        <p className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-amber-900">
          Conformément à l’article <strong>L221-28 12° du Code de la consommation</strong>, le droit de rétractation
          ne s’applique pas aux prestations d’activités de loisirs fournies à une date ou à une période déterminée.
          Les billets, séances et abonnements achetés sur le site ne peuvent donc pas faire l’objet d’une
          rétractation après paiement.
        </p>
      </LegalSection>

      <LegalSection id="seances" title="5. Déroulement des séances et présence">
        <ul>
          <li>
            Pour les activités à séances, vous recevez des rappels par e-mail avant chaque séance et confirmez votre
            présence (ou signalez votre absence) en un clic, depuis l’e-mail ou votre espace personnel.
          </li>
          <li>
            Les confirmations sont clôturées {CONFIRMATION_CLOSE_HOURS} heures avant la séance. Sans confirmation à
            cette échéance, vous êtes compté(e) absent(e) pour l’organisation de la séance.
          </li>
          <li>
            Une séance d’abonnement non utilisée pendant sa durée de validité ne donne pas lieu à remboursement, sauf
            disposition contraire indiquée sur l’offre.
          </li>
          <li>Merci de respecter les horaires, les lieux, les autres participants et les consignes des intervenants.</li>
        </ul>
      </LegalSection>

      <LegalSection id="annulation" title="6. Annulation ou report par l’organisateur">
        <p>
          Si une séance ou un événement est annulé ou reporté de notre fait, vous en êtes informé(e) par e-mail ou
          dans votre espace personnel. La séance est alors reprogrammée ou, si aucune nouvelle date ne vous convient,
          remboursée pour la part correspondante.
        </p>
      </LegalSection>

      <LegalSection id="responsabilite" title="7. Responsabilité">
        <p>
          Nous mettons tout en œuvre pour assurer le bon déroulement des activités et l’accès au site. Notre
          responsabilité ne saurait être engagée en cas de force majeure, de fait d’un tiers ou de mauvaise
          utilisation du service. Chaque participant reste responsable de ses effets personnels et de son
          comportement pendant les activités.
        </p>
      </LegalSection>

      <LegalSection id="donnees" title="8. Données personnelles">
        <p>
          Vos données sont traitées conformément à notre{" "}
          <Link href="/confidentialite">politique de confidentialité</Link>, que vous acceptez lors de la création de
          votre compte.
        </p>
      </LegalSection>

      <LegalSection id="litiges" title="9. Réclamations, médiation et droit applicable">
        <p>Pour toute réclamation, contactez-nous d’abord à {mail} : nous vous répondrons dans les meilleurs délais.</p>
        <p>
          Conformément aux articles L611-1 et suivants du Code de la consommation, si votre réclamation n’a pas abouti,
          vous pouvez recourir gratuitement à un médiateur de la consommation
          {CONSUMER_MEDIATOR.name ? (
            <>
              {" "}: <strong className="text-zinc-900">{CONSUMER_MEDIATOR.name}</strong>
              {CONSUMER_MEDIATOR.address ? `, ${CONSUMER_MEDIATOR.address}` : ""}
              {CONSUMER_MEDIATOR.website ? (
                <>
                  {" "}—{" "}
                  <a href={CONSUMER_MEDIATOR.website} target="_blank" rel="noopener noreferrer">
                    {CONSUMER_MEDIATOR.website.replace(/^https?:\/\//, "")}
                  </a>
                </>
              ) : null}
            </>
          ) : (
            <>, dont les coordonnées vous sont communiquées sur simple demande</>
          )}
          , dans un délai d’un an à compter de votre réclamation écrite.
        </p>
        <p>
          Les présentes conditions sont soumises au droit français. En cas de litige, et à défaut d’accord amiable,
          vous pouvez saisir la juridiction du lieu de votre domicile ou celle du lieu de l’exécution de la prestation.
        </p>
      </LegalSection>
    </LegalPage>
  );
}
