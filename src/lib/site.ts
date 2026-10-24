/** Coordonnées publiques affichées sur le site (pied de page, page de paiement). */
export const CONTACT_EMAIL = "contact@wantedtunevents.com";
export const CONTACT_PHONE = "+33 7 68 37 64 62";
export const SITE_URL = "https://wantedtunevents.com";

export const SOCIAL_LINKS = {
  instagram: "https://www.instagram.com/wanted.tun.events/",
  facebook: "https://www.facebook.com/profile.php?id=61580229353795",
} as const;

/**
 * Identité de l'éditeur, affichée dans les mentions légales (loi n° 2004-575 du 21 juin 2004, art. 6 III)
 * et dans la politique de confidentialité (responsable du traitement, RGPD art. 13).
 * Un champ vide n'est pas affiché : à compléter dès que l'information est connue.
 */
export const PUBLISHER: Readonly<Record<
  "name" | "legalForm" | "address" | "registration" | "vatNumber" | "publicationDirector" | "email" | "phone",
  string
>> = {
  name: "WANTED TUN EVENTS",
  /** Ex. « Association loi 1901 », « SAS au capital de 1 000 € », « Entreprise individuelle ». */
  legalForm: "",
  /** Adresse du siège (ou du domicile de l'entrepreneur individuel). */
  address: "",
  /** SIREN / SIRET, numéro RCS ou RNA (association). */
  registration: "",
  /** Numéro de TVA intracommunautaire, s'il y en a un. */
  vatNumber: "",
  /** Directeur ou directrice de la publication (personne physique). */
  publicationDirector: "",
  email: CONTACT_EMAIL,
  phone: CONTACT_PHONE,
};

/**
 * Médiateur de la consommation (Code de la consommation, art. L612-1) : obligatoire pour vendre à des particuliers.
 * Vide tant qu'aucun médiateur n'a été désigné (la page des conditions générales l'indique alors sans le nommer).
 * La plateforme européenne de règlement en ligne des litiges (ODR) a fermé le 20 juillet 2025 : ne plus la citer.
 */
export const CONSUMER_MEDIATOR: { name: string; website: string; address: string } = {
  name: "",
  website: "",
  address: "",
};

/** Hébergeur et sous-traitants qui reçoivent des données personnelles. */
export const HOSTING_PROVIDER = {
  name: "Vercel Inc.",
  address: "440 N Barranca Ave #4133, Covina, CA 91723, États-Unis",
  website: "https://vercel.com",
} as const;

/**
 * Version des conditions générales et de la politique de confidentialité.
 * La changer quand leur contenu change de façon importante : l'acceptation enregistrée porte cette version.
 */
export const LEGAL_VERSION = "2026-10-24";
