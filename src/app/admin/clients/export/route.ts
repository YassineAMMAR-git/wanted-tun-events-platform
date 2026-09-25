import ExcelJS from "exceljs";
import { requireAdmin } from "@/lib/auth";
import { listAdminClients } from "@/lib/queries";

export const dynamic = "force-dynamic";

/**
 * Export Excel de la liste des clients.
 *
 * Les mêmes filtres que la page `/admin/clients` sont acceptés : le fichier
 * contient donc exactement les lignes affichées, dans le même ordre.
 * `requireAdmin()` protège l'accès — le fichier contient des données personnelles.
 */
export async function GET(request: Request) {
  await requireAdmin();

  const params = new URL(request.url).searchParams;
  const rows = await listAdminClients({
    q: params.get("q") ?? undefined,
    role: params.get("role") ?? undefined,
    verifie: params.get("verifie") ?? undefined,
    abo: params.get("abo") ?? undefined,
    tri: params.get("tri") ?? undefined,
  });

  const workbook = new ExcelJS.Workbook();
  workbook.creator = "WANTED TUN EVENTS";
  workbook.created = new Date();

  const sheet = workbook.addWorksheet("Clients", {
    views: [{ state: "frozen", ySplit: 1 }],
  });

  sheet.columns = [
    { header: "Nom", key: "lastName", width: 20 },
    { header: "Prénom", key: "firstName", width: 18 },
    { header: "E-mail", key: "email", width: 32 },
    { header: "Téléphone", key: "phone", width: 18 },
    { header: "Ville", key: "city", width: 18 },
    { header: "Rôle", key: "role", width: 14 },
    { header: "E-mail confirmé", key: "verified", width: 16 },
    { header: "Langue", key: "locale", width: 10 },
    { header: "Abonnements", key: "subscriptions", width: 13 },
    { header: "Dont actifs", key: "active", width: 12 },
    { header: "Séances suivies", key: "attendances", width: 15 },
    { header: "Inscrit le", key: "createdAt", width: 18 },
    { header: "Notes", key: "notes", width: 40 },
  ];

  const header = sheet.getRow(1);
  header.font = { bold: true, color: { argb: "FF1C1A17" } };
  header.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF5C451" } };
  header.alignment = { vertical: "middle" };
  header.height = 22;

  for (const { user, subscriptions, active, attendances } of rows) {
    sheet.addRow({
      lastName: user.lastName,
      firstName: user.firstName,
      email: user.email,
      phone: user.phone ?? "",
      city: user.city ?? "",
      role: user.role === "admin" ? "Administrateur" : "Client",
      verified: user.emailVerifiedAt ? "Oui" : "Non",
      locale: user.locale,
      subscriptions,
      active,
      attendances,
      createdAt: user.createdAt,
      notes: user.notes ?? "",
    });
  }

  sheet.getColumn("createdAt").numFmt = "dd/mm/yyyy hh:mm";
  for (const key of ["subscriptions", "active", "attendances"]) {
    sheet.getColumn(key).alignment = { horizontal: "center" };
  }
  // Filtres Excel sur l'en-tête : le fichier reste exploitable tel quel.
  sheet.autoFilter = { from: "A1", to: { row: 1, column: sheet.columnCount } };

  const buffer = await workbook.xlsx.writeBuffer();
  const stamp = new Date().toISOString().slice(0, 10);

  return new Response(buffer, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="clients-wanted-tun-${stamp}.xlsx"`,
      "Cache-Control": "no-store",
    },
  });
}
