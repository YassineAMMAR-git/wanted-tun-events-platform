import type { Metadata } from "next";
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { LegalField, LegalPage, LegalSection } from "@/components/legal-page";
import { HOSTING_PROVIDER, PUBLISHER, SITE_URL } from "@/lib/site";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("legal");
  return { title: `${t("legalNotice")} — ${PUBLISHER.name}` };
}

/** Mentions légales (loi n° 2004-575 du 21 juin 2004 pour la confiance dans l'économie numérique, art. 6 III). */
export default async function LegalNoticePage() {
  const t = await getTranslations("legal");

  return (
    <LegalPage title={t("legalNotice")}>
      <LegalSection id="editeur" title="1. Éditeur du site">
        <p>
          Le site <a href={SITE_URL}>{SITE_URL.replace("https://", "")}</a> est édité par :
        </p>
        <ul>
          <li>
            <strong className="text-zinc-900">{PUBLISHER.name}</strong>
            {PUBLISHER.legalForm ? `, ${PUBLISHER.legalForm}` : ""}
          </li>
          <LegalField label="Siège" value={PUBLISHER.address} />
          <LegalField label="Immatriculation" value={PUBLISHER.registration} />
          <LegalField label="N° de TVA intracommunautaire" value={PUBLISHER.vatNumber} />
          <li>
            <strong className="text-zinc-900">E-mail :</strong> <a href={`mailto:${PUBLISHER.email}`}>{PUBLISHER.email}</a>
          </li>
          <li>
            <strong className="text-zinc-900">Téléphone :</strong>{" "}
            <a href={`tel:${PUBLISHER.phone.replace(/\s/g, "")}`}>{PUBLISHER.phone}</a>
          </li>
          <LegalField label="Directeur·rice de la publication" value={PUBLISHER.publicationDirector} />
        </ul>
      </LegalSection>

      <LegalSection id="hebergeur" title="2. Hébergeur">
        <ul>
          <li>
            <strong className="text-zinc-900">{HOSTING_PROVIDER.name}</strong>
          </li>
          <li>{HOSTING_PROVIDER.address}</li>
          <li>
            <a href={HOSTING_PROVIDER.website} target="_blank" rel="noopener noreferrer">
              {HOSTING_PROVIDER.website.replace("https://", "")}
            </a>
          </li>
        </ul>
        <p>Les données du site sont stockées dans l’Union européenne (Francfort, Allemagne).</p>
      </LegalSection>

      <LegalSection id="propriete" title="3. Propriété intellectuelle">
        <p>
          L’ensemble des contenus du site (textes, logo, photographies, mise en page) est la propriété de{" "}
          {PUBLISHER.name} ou de ses partenaires et est protégé par le Code de la propriété intellectuelle. Toute
          reproduction ou réutilisation, totale ou partielle, sans autorisation écrite préalable est interdite.
        </p>
      </LegalSection>

      <LegalSection id="donnees" title="4. Données personnelles et cookies">
        <p>
          Le traitement de vos données personnelles et l’usage des cookies sont décrits dans notre{" "}
          <Link href="/confidentialite">politique de confidentialité</Link>, conforme au RGPD et à la loi
          Informatique et Libertés.
        </p>
      </LegalSection>

      <LegalSection id="responsabilite" title="5. Responsabilité et liens">
        <p>
          {PUBLISHER.name} s’efforce de fournir des informations exactes et à jour, mais ne peut garantir l’absence
          d’erreur. Les liens vers des sites externes (réseaux sociaux, billetteries partenaires) sont fournis pour
          votre commodité : nous ne sommes pas responsables de leur contenu.
        </p>
      </LegalSection>

      <LegalSection id="droit" title="6. Droit applicable">
        <p>
          Le site et ses mentions légales sont soumis au droit français. Les conditions de vente sont précisées dans
          nos <Link href="/conditions-generales">conditions générales</Link>.
        </p>
      </LegalSection>
    </LegalPage>
  );
}
