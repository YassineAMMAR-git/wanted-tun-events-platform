#!/usr/bin/env node
/*
 * Sauvegarde du travail en cours : vérifie, commit puis pousse vers GitHub.
 *
 *   npm run save                  → message automatique ("chore: mise à jour du 12/03/2026 14:05")
 *   npm run save -- "mon message" → message choisi
 *   npm run save -- --no-check    → saute typecheck/lint (à éviter)
 *
 * Le push déclenche un déploiement Vercel : on refuse donc de pousser du code
 * qui ne compile pas, et on s'arrête net si un fichier sensible est sur le point
 * d'être publié.
 */
import { execFileSync, execSync } from "node:child_process";

const args = process.argv.slice(2);
const skipChecks = args.includes("--no-check");
const message = args.filter((a) => !a.startsWith("--")).join(" ").trim();

const git = (...a) => execFileSync("git", a, { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
/** git est un vrai exécutable : pas de shell, sinon les messages contenant des espaces sont découpés. */
const runGit = (...a) => execFileSync("git", a, { stdio: "inherit" });
/**
 * npx est un .cmd sous Windows, que Node refuse de lancer sans shell depuis la v20.
 * Les arguments sont fixes et sans espace : la chaîne est donc sûre ici.
 */
const runNpx = (...a) => execSync(`npx ${a.join(" ")}`, { stdio: "inherit" });

function bail(reason, hint) {
  console.error(`\n✖ ${reason}`);
  if (hint) console.error(`  ${hint}`);
  process.exit(1);
}

/* ------------------------------ état du dépôt ----------------------------- */
try {
  git("rev-parse", "--is-inside-work-tree");
} catch {
  bail("Ce dossier n'est pas un dépôt git.", "Lancez d'abord : git init");
}

if (!git("status", "--porcelain")) {
  console.log("Rien à sauvegarder : aucun fichier modifié.");
  process.exit(0);
}

/* --------------------- garde-fou : fichiers sensibles --------------------- */
// .gitignore couvre déjà .env, mais un `git add -f` ou un .gitignore modifié
// pourrait le laisser passer : on vérifie ce qui part réellement.
git("add", "-A");
const staged = git("diff", "--cached", "--name-only").split("\n").filter(Boolean);
const secrets = staged.filter((f) => /(^|\/)\.env$/.test(f) || /\.env\.(local|production)$/.test(f) || /\.pem$/.test(f));
if (secrets.length) {
  bail(
    `Fichier sensible sur le point d'être publié : ${secrets.join(", ")}`,
    "Retirez-le avec : git rm --cached <fichier>   (et vérifiez .gitignore)",
  );
}

/* ------------------------------ vérifications ----------------------------- */
if (skipChecks) {
  console.log("⚠  Vérifications ignorées (--no-check).\n");
} else {
  console.log("→ Vérification des types…");
  try {
    runNpx("tsc", "--noEmit");
  } catch {
    bail("Le typecheck a échoué : rien n'a été poussé.", "Corrigez les erreurs, ou forcez avec --no-check.");
  }
  console.log("→ Analyse du code (eslint)…");
  try {
    runNpx("eslint", ".");
  } catch {
    bail("ESLint a échoué : rien n'a été poussé.", "Corrigez les erreurs, ou forcez avec --no-check.");
  }
  console.log("✓ Vérifications passées.\n");
}

/* -------------------------------- commit ---------------------------------- */
const stamp = new Date().toLocaleString("fr-FR", { dateStyle: "short", timeStyle: "short" });
const subject = message || `chore: mise à jour du ${stamp}`;

git("add", "-A");
runGit("commit", "-m", subject);

/* --------------------------------- push ----------------------------------- */
const branch = git("rev-parse", "--abbrev-ref", "HEAD");
let hasRemote = true;
try {
  git("remote", "get-url", "origin");
} catch {
  hasRemote = false;
}

if (!hasRemote) {
  console.log(
    `\n✓ Commit créé sur « ${branch} », mais aucun dépôt distant n'est configuré.\n` +
      "  Ajoutez-le puis relancez :\n" +
      "    git remote add origin https://github.com/<vous>/<depot>.git\n" +
      `    git push -u origin ${branch}`,
  );
  process.exit(0);
}

console.log(`\n→ Envoi vers origin/${branch}…`);
try {
  runGit("push", "-u", "origin", branch);
} catch {
  bail(
    "Le push a échoué.",
    "Si quelqu'un (ou vous, ailleurs) a poussé entre-temps : git pull --rebase puis relancez npm run save.",
  );
}

console.log(`\n✓ « ${subject} » est sur GitHub. Vercel déploie la nouvelle version.`);
