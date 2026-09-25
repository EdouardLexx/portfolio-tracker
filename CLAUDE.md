# CLAUDE.md

Mémoire permanente du projet. À lire au début de chaque session.
Détails : `docs/ARCHITECTURE.md`, `docs/PROJECT_STATUS.md`, `docs/DECISIONS.md`,
`docs/TODO.md`.

## Project overview

Suivi de patrimoine personnel, mono-utilisateur, en local. L'application agrège
plusieurs comptes (PEA, CTO, crypto, or physique, Livret A, cash), valorise les
positions avec des cours en direct et calcule performance et répartition.

Fonctionnalités réellement présentes :

- import de relevés (CSV DEGIRO, PDF Boursorama, CSV Ledger Live, CSV compte
  Boursorama) et saisie manuelle (or, cash, versements Livret A) ;
- déduplication à l'import, historique cumulatif ;
- valorisation multi-devises via Yahoo Finance ;
- performance TWR comparée au S&P 500 et au Nasdaq 100 ;
- courbes de valeur, répartition, frais, projection à 10 ans ;
- thème clair/sombre ;
- mode discret : masque montants et quantités, garde les pourcentages ;
- emprunts (hors immobilier) : échéancier, capital restant dû, coût total,
  patrimoine net dans Patrimoine ;
- fiche d'un titre à la Google Finance (courbe intraday à 10 ans, statistiques
  du jour), ouverte depuis le tableau des positions ou le camembert ;
- sauvegarde : export du portefeuille dans un fichier, import par fusion ou
  remplacement (`src/utils/backup.ts`) ;
- synchronisation Google Drive facultative (`src/utils/sync.ts`,
  `src/api/googleDrive.ts`, `src/hooks/useDriveSync.ts`) : codée et testée,
  inactive tant que `GOOGLE_CLIENT_ID` est vide (`docs/GOOGLE_DRIVE.md`).
  Interface en ligne pour le téléphone prévue (`docs/TODO.md`).

Utilisateur visé : le propriétaire du portefeuille, seul. Aucune authentification,
aucun multi-utilisateur.

État : fonctionnel en local, utilisé au quotidien. **Aucun test automatisé.**

Licence : **AGPL-3.0-or-later**, titulaire EdouardLexx (`LICENSE`).

## Tech stack

- **Langage** : TypeScript (front), JavaScript (serveur `server/`).
- **Front** : React 19, Vite 8, Tailwind CSS 4, Recharts 2.15.
- **Back** : Node + Express 5, proxy vers Yahoo Finance (`yahoo-finance2` v4).
- **Base de données** : aucune. Persistance = `localStorage` du navigateur.
- **Librairies clés** : `papaparse` (CSV), `pdfjs-dist` (PDF), `recharts`.
- **Outils** : `oxlint`, `tsc -b`, `concurrently` ; Bun pour fabriquer les
  exécutables.
- **Exécution** : Node via nvm. En développement, front sur `:5173` et API sur
  `:3001` ; l'exécutable et `npm start` servent tout sur `127.0.0.1:4719`.

## Project structure

```
server.js            entrée de développement : l'API sur :3001
server/api.js        routes Express (proxy Yahoo + taux Livret A)
server/standalone.js entrée de l'exécutable : API + interface sur :4719
scripts/             licences tierces, embarquement de dist/, compilation
                     des exécutables ; licenses/bun.md = licence de Bun
.github/workflows/   fabrication, test et publication des exécutables
public/              statique ; Transactions.csv = amorçage local, ignoré par git
src/types/           modèle de données unique (Transaction, Position…)
src/parsers/         un fichier par source + shared.ts (fusion dédupliquée)
src/utils/           calculs purs : positions, TWR, projection, emprunts,
                     stockage, formats, saisie des montants, dates locales
src/hooks/           usePortfolio (orchestrateur), useTheme, useDiscreet,
                     useInstrument (fiche d'un titre)
src/api/             client HTTP vers /api ; googleDrive.ts = connexion
                     Google et dossier « Portfolio Manager » du Drive
src/pages/           Wealth, Investments, Gold, Savings, Loans, Data
src/components/      graphes et blocs réutilisables
```

## Development commands

```bash
npm install                 # dépendances
npm run dev                 # API (3001) + front (5173) ensemble
npm start                   # build + app complète sur 127.0.0.1:4719
npm run package             # exécutables des 4 plateformes (demande Bun)
npm run server              # API seule
npm run build               # tsc -b && vite build
npm run lint                # oxlint
npx tsc -b --noEmit         # vérification de types seule
```

Pas de tests, pas de migrations : aucune commande correspondante n'existe.
Node doit être disponible (`export PATH="$HOME/.local/bin:$PATH"` si nvm n'est
pas chargé).

## Architecture rules

1. **Un seul modèle de données.** Toute source se normalise en `Transaction`
   (`src/types/index.ts`). Les pages, calculs et graphes ne connaissent que ce
   modèle ; les spécificités d'un courtier s'arrêtent à son parseur.
2. **Les calculs financiers restent purs et hors composants** (`src/utils/`),
   pour être testables et réutilisables.
3. **Un parseur par source** dans `src/parsers/`, détection du format **au
   contenu du fichier**, jamais au nom.
   Toute évolution d'un parseur met à jour la liste des données compatibles
   (`FILE_SOURCES` dans `src/pages/Data.tsx`) et le tableau du README.
4. **Les identifiants de transaction** se construisent avec `makeTransactionId`
   (`src/parsers/shared.ts`) pour hériter de la déduplication.
5. `usePortfolio` est le seul orchestrateur : état, réseau, persistance.
   Deux délégations : les cours éphémères de la fiche d'un titre
   (`useInstrument`, rien n'y touche le portefeuille), et la synchronisation
   Drive (`useDriveSync`, appelé par `usePortfolio`, qui ne modifie les données
   que par son `applyData`).
6. Le serveur ne fait que **proxy + cache** (et, dans l'exécutable, servir
   l'interface). Aucune logique métier côté serveur.

## Financial/business rules

Règles réellement implémentées. Toute modification ici change des chiffres
affichés : vérifier avant de toucher.

- **Achats seulement.** Ventes et sorties sont détectées, signalées à l'import
  puis **ignorées** : DEGIRO `quantité < 0`, PDF « VENTE COMPTANT », Ledger
  `OUT` et opérations non confirmées.
- **Prix de revient** = `amountEUR`, en euros historiques réels.
  **L'inclusion des frais diffère selon la source** (voir `docs/ARCHITECTURE.md`,
  section Frais) : DEGIRO les **exclut**, PEA et Ledger les **incluent**.
- **Agrégation par symbole puis ISIN** (`tx.symbol || tx.isin || tx.productName`),
  jamais par nom de produit : un fonds renommé reste la même ligne.
- **Déduplication par nombre d'occurrences**, pas par présence : les exécutions
  fractionnées d'un même ordre partagent un identifiant et sont comptées.
- **Devises** : `toEur(montant, devise, rates)`, où `rates` = unités par 1 EUR.
- **Intérêts** (`interestEUR`) augmentent le solde sans entrer dans le prix de
  revient.
- **CAGR** : calculé seulement si la détention dépasse un an, sinon `null`.
- **TWR** (`src/utils/performance.ts`) : rendements quotidiens chaînés, apports
  neutralisés. Un jour non valorisable **reporte** ses flux au jour suivant ; les
  indices sont reportés à leur dernière valeur connue.
- **Or** : valorisé au **poids d'or fin** (20 CHF = 5,80645 g) depuis `GC=F`
  (USD/once) converti en euros. La prime numismatique n'est pas suivie.
- **Livret A / cash** : pas de cours. La position tient une unité par mouvement,
  valorisée au solde ; le solde vient des opérations du relevé, ou d'une saisie
  manuelle à défaut. **Sans mouvement, pas de position** : un solde saisi alors
  qu'aucun mouvement n'existe devient un mouvement « Solde de départ »
  (`buildSavingsDeposit(…, 'opening')`), compté comme apport ; les intérêts se
  mesurent à partir de lui.
- **Emprunts** (`src/utils/loans.ts`) : modèle à part (`Loan`), jamais des
  `Transaction`. Taux fixe, taux mensuel = nominal / 12, intérêts arrondis au
  centime chaque mois, dernière échéance absorbe les arrondis. La durée inclut
  le différé ; partiel = intérêts seuls, total = intérêts capitalisés. Le prêt
  n'existe qu'à partir de sa date de déblocage. **Patrimoine net = brut −
  capital restant dû** ; les intérêts d'emprunt n'entrent pas dans le TWR.
  Pas de prêt immobilier tant que la valeur du bien n'est pas suivie.

## Coding conventions

- Français pour l'interface et les messages utilisateur ; **anglais pour le
  code, les noms et les commentaires**.
- Commentaires rares, réservés au *pourquoi* non évident (pièges de format,
  choix financiers). Pas de commentaire descriptif redondant.
- Composants fonctionnels, `useMemo` pour les calculs dérivés.
- Tailwind uniquement ; **toute classe de couleur doit avoir sa variante
  `dark:`**. La couleur de texte par défaut est posée sur `body`
  (`src/index.css`).
- Montants formatés via `src/utils/formatters.ts`, jamais à la main : c'est ce
  qui les soumet au mode discret. Un nombre qui mesure une détention (grammes,
  sommes versées) passe par `formatHolding`, pas `formatNumber`. Un cours de
  marché en euros passe par `formatMoney(x, 'EUR')`, qui n'est pas masqué.
- Montants saisis lus par `parseDecimalInput` (`src/utils/input.ts`), jamais
  `parseFloat` (« 1 200 » donnerait 1). Date du jour : `localToday()`, jamais
  `toISOString()` (la veille avant 2 h en France).
- Aucune ressource tierce dans l'interface (police web, CDN, script) : seuls
  les codes de titres partent vers Yahoo, via le serveur local. **Seule
  exception** : la synchronisation Drive, une fois activée par l'utilisateur,
  parle directement à Google (connexion, dossier « Portfolio Manager »), sans
  script Google.
- `type` importés avec `import type`.

## Important constraints

À ne pas casser sans raison explicite :

- `isAnimationActive={false}` sur tous les graphes Recharts : la version 2.15 ne
  rend pas les formes sous React 19 quand les animations sont actives.
- Les clés `localStorage` versionnées (`portfolio.*.v1/v2`) : les changer perd
  les données de l'utilisateur.
- La logique de déduplication et la construction des identifiants.
- La suppression de lignes se fait **par position**, jamais par identifiant
  (les fills jumeaux partagent un identifiant).
- Le report des flux et des indices dans le calcul TWR.
- `public/Transactions.csv` est ignoré par git mais, s'il existe localement,
  **part dans le build** : ne pas déployer un `dist/` construit avec lui.
- **Dépôt public** : ne jamais écrire dans le code, les commentaires ou la
  documentation un chiffre, un titre, une date ou un montant issu des données
  réelles de l'utilisateur. Utiliser des exemples fictifs ou des faits publics.
  Aucun `.csv`, `.pdf` ou `.xlsx` ne doit être commité.
- **Le port 4719 et l'hôte `127.0.0.1` de l'exécutable** : le navigateur range
  les données par origine, en changer ouvre un portefeuille vide.
- `scripts/embed-dist.mjs` **exclut les fichiers de données** de `dist/` : sans
  cela, un build local embarquerait `public/Transactions.csv` dans un
  exécutable publié. Publier depuis la CI (tag `v*`), jamais depuis le poste.
- **La synchro Drive** : clés `portfolio.sync.v1` et `portfolio.syncBase.v1`
  (la base de la fusion à trois voies ; la perdre fait fusionner par union,
  sans perte). Toute nouvelle adresse de l'appli (port, GitHub Pages) doit être
  ajoutée aux origines et URI de redirection du client Google
  (`docs/GOOGLE_DRIVE.md`), sinon la connexion échoue.
- **Le format de sauvegarde** (`BackupData`, `BACKUP_VERSION` dans
  `src/utils/backup.ts`) : des fichiers existent chez les utilisateurs ; changer
  sa forme impose d'incrémenter la version et de relire les anciennes.
- **Les mentions de licences tierces** (`dist/THIRD_PARTY_LICENSES.txt`) sont
  exigées par les licences des dépendances pour toute redistribution. Changer
  la version de Bun dans la CI impose de mettre à jour
  `scripts/licenses/bun.md` : `scripts/package.mjs` refuse sinon de compiler.

## Git and releases

- Dépôt **public** `EdouardLexx/portfolio-tracker`, branche `main`. Seul
  l'auteur a l'accès en écriture.
- Commiter chaque changement cohérent, message **en français** qui explique le
  pourquoi ; pousser en fin de tâche, une fois vérifiée. Avant chaque push,
  `git diff --cached --name-only` : aucun fichier de données, aucun montant,
  titre ou ISIN réellement détenu.
- Identité git **locale au dépôt** : `EdouardLexx
  <207677044+EdouardLexx@users.noreply.github.com>`. Ne jamais y mettre une
  adresse personnelle.
- Une fuite déjà poussée ne s'efface pas par un force-push (le commit reste
  atteignable) : il faut réécrire l'historique **et** recréer le dépôt.
- **Release** : l'auteur pousse un tag `vX.Y.Z` ; `.github/workflows/release.yml`
  fabrique, teste et publie les exécutables. Jamais de release depuis le poste.
  Vérifier l'état par `gh run list --workflow=release.yml --limit 3`, sans
  attente bloquante (`gh run watch`).

## Testing without a test suite

- Fonction pure de `src/utils/` ou `src/parsers/` : script jetable hors du
  dépôt, lancé par `node --experimental-strip-types` (Node ≥ 22), sur un cas
  dont la réponse est connue.
- Interface : `npm run dev`, puis le navigateur. `localhost:5173` et
  `127.0.0.1:5173` sont **deux origines, donc deux portefeuilles** distincts.
  L'auteur garde ses vraies données sur l'une : demander laquelle sert aux
  essais, et n'importer, supprimer ni réinitialiser que là. Ailleurs, lecture
  seule.
- API : `curl http://127.0.0.1:3001/api/...` ; `server.js` ne se recharge pas
  seul après une modification de `server/api.js`, le relancer.

## Working instructions for Claude Code

1. **Inspecter avant de modifier.** Lire le code concerné ; ne pas se fier à un
   historique de conversation.
2. **Respecter l'architecture** ci-dessus : nouveau format → nouveau parseur,
   nouveau calcul → `src/utils/`.
3. **Ne jamais inventer une règle métier.** Si le comportement attendu est
   ambigu (traitement des frais, des ventes, des dividendes), demander plutôt
   que supposer.
4. **Vérifier après modification** : `npx tsc -b --noEmit` et `npm run lint` au
   minimum. Pour un calcul financier, valider sur un cas dont la réponse est
   connue, et vérifier les `diagnostics` de `computePerformance`.
5. **Mettre à jour la documentation** quand une décision structurante change :
   `docs/DECISIONS.md` pour le pourquoi, `docs/PROJECT_STATUS.md` pour l'état,
   `docs/TODO.md` pour la suite.
6. Ne pas ajouter de dépendance sans nécessité ; ce projet tourne en local.
   Toute dépendance doit avoir une licence compatible avec l'AGPL-3.0
   (MIT, BSD, ISC, Apache-2.0, MPL-2.0… ; ni GPL-2.0-only, ni propriétaire).
