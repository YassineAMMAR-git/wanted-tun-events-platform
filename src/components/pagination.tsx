import Link from "next/link";

type Props = {
  /** Page affichée (à partir de 1) et nombre total de pages. */
  page: number;
  pageCount: number;
  /** Adresse de la liste et critères en cours (recherche, filtres, tri) à conserver d'une page à l'autre. */
  basePath: string;
  params?: Record<string, string | undefined>;
  /** Ancre du tableau : le changement de page ramène dessus plutôt qu'en haut de l'écran. */
  anchor?: string;
  labels: { previous: string; next: string; status: string };
};

/** Numéro de page lu dans l'URL : entier à partir de 1, borné au nombre de pages. */
export function readPage(value: string | undefined, pageCount: number): number {
  const page = Math.floor(Number(value));
  return Number.isFinite(page) && page >= 1 ? Math.min(page, Math.max(pageCount, 1)) : 1;
}

/** Boutons « précédent / suivant » sous un tableau paginé ; rien n'est affiché s'il n'y a qu'une page. */
export function Pagination({ page, pageCount, basePath, params = {}, anchor, labels }: Props) {
  if (pageCount <= 1) return null;

  const href = (target: number) => {
    const query = new URLSearchParams(
      Object.entries(params).filter((entry): entry is [string, string] => Boolean(entry[1])),
    );
    if (target > 1) query.set("page", String(target));
    const search = query.toString();
    return `${basePath}${search ? `?${search}` : ""}${anchor ? `#${anchor}` : ""}`;
  };
  const disabled = "btn btn-ghost btn-sm pointer-events-none opacity-40";

  return (
    <nav className="mt-3 flex flex-wrap items-center justify-between gap-2" aria-label={labels.status}>
      {page > 1 ? (
        <Link href={href(page - 1)} className="btn btn-ghost btn-sm" rel="prev">
          {labels.previous}
        </Link>
      ) : (
        <span className={disabled} aria-disabled="true">
          {labels.previous}
        </span>
      )}
      <span className="text-xs text-zinc-500">{labels.status}</span>
      {page < pageCount ? (
        <Link href={href(page + 1)} className="btn btn-ghost btn-sm" rel="next">
          {labels.next}
        </Link>
      ) : (
        <span className={disabled} aria-disabled="true">
          {labels.next}
        </span>
      )}
    </nav>
  );
}
