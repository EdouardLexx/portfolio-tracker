# Architecture

Décrit le code tel qu'il est aujourd'hui. Les chemins sont ceux du dépôt.

## Vue d'ensemble

Application web locale en deux processus, lancés ensemble par `npm run dev` :

| Processus | Port | Rôle |
|---|---|---|
| Vite + React | 5173 | interface, calculs, persistance |
| Express (`server.js`) | 3001 | proxy Yahoo Finance + taux Livret A, avec cache |

C'est le mode développement. Vite proxifie `/api` vers `:3001` (`vite.config.ts`).
L'exécutable et `npm start` réunissent les deux dans un seul processus sur
`127.0.0.1:4719` (voir *Exécutable* plus bas). **Toute la logique métier
est côté navigateur** ; le serveur ne fait que relayer des données de marché.

Il n'y a **pas de base de données**. Les données vivent dans le `localStorage`
du navigateur, donc elles sont propres à une machine et à un navigateur.

## Backend — `server/api.js`

Les routes vivent dans `server/api.js`, qui exporte l'application Express sans
l'écouter. Deux points d'entrée la démarrent : `server.js` (développement, port
3001) et `server/standalone.js` (exécutable, port 4719). Express 5, cache
mémoire par clé avec TTL (`cached(key, ttl, fn)`), borné à 5 000 entrées. Le
cache garde la **promesse** : des requêtes identiques simultanées partagent un
seul appel Yahoo, et un échec est aussitôt retiré du cache. Une coupure réseau
passagère (`fetch failed`, `ECONNRESET`…) est retentée une fois après 500 ms
(`retryOnce`) ; un refus de Yahoo ne l'est pas.

Le serveur n'écoute que sur `127.0.0.1` et n'autorise aucune origine croisée :
le navigateur passe par le proxy `/api` de Vite. Chaque paramètre est validé
(`SYMBOL`, `ISIN`, `CURRENCY`, `DATE`) : un symbole ou une date invalide donne
400 ; dans une liste (`isins`, `symbols`, `currencies`), l'élément mal formé est
écarté sans bloquer les autres. Les listes sont plafonnées à 100 éléments par
requête (400 au-delà). Une panne en amont (Yahoo, Caisse des Dépôts) répond 502.

| Endpoint | Rôle | TTL | Utilisé ? |
|---|---|---|---|
| `GET /api/resolve` | ISIN (+ nom) → symbole Yahoo | 24 h | oui |
| `GET /api/quotes` | cours instantanés | 60 s | oui |
| `GET /api/history` | historique quotidien (`chart`) | 15 min | oui |
| `GET /api/fx` | taux, unités par 1 EUR | 60 s | oui |
| `GET /api/livret-a` | taux du Livret A (Caisse des Dépôts) | 24 h | oui |
| `GET /api/instrument` | fiche d'un titre : cours, variation, ouverture, haut/bas, capitalisation, PER, dividende, 52 semaines, après-clôture | 60 s (cache des cours) | oui |
| `GET /api/chart` | courbe d'un titre sur une période (`1d` à `max`) | 1 min à 6 h selon la période | oui |

**Résolution d'un ISIN** (`/api/resolve`) en trois niveaux :
1. table d'exceptions `ISIN_OVERRIDES` (classes d'actions non indexées, ex.
   `US02079K3059 → GOOGL`) ;
2. recherche Yahoo par ISIN ;
3. repli sur le nom de produit nettoyé (`cleanProductName`).
Les candidats sont classés par `score()` : actions/ETF favorisés, fonds pénalisés,
`.PA` privilégié pour les ISIN français.

**Taux du Livret A** : jeu `flux-et-taux-la-ldds-lep` de la Caisse des Dépôts,
champ `tla_tldds_percent`, enregistrement le plus récent.

## Modèle de données — `src/types/index.ts`

`Transaction` est la pièce centrale. Une ligne = une exécution.

| Champ | Sens |
|---|---|
| `id` | identité de la ligne (`makeTransactionId`) — **volontairement partagée par des fills jumeaux** |
| `account` | `pea` \| `degiro` \| `ledger` \| `gold` \| `savings` \| `cash` |
| `date` / `time` | `YYYY-MM-DD` / `HH:MM:SS` |
| `isin` | vide pour crypto, or, épargne |
| `symbol?` | symbole de marché quand la source le connaît (crypto, or, épargne) |
| `quantity` | quantité (fractionnaire pour la crypto) |
| `price` | prix unitaire, en `currency` |
| `currency` | devise de l'instrument |
| `grossLocal` | brut en devise de l'instrument |
| `amountEUR` | **prix de revient en euros historiques** |
| `brokerFeesEUR` / `fxFeesEUR` / `feesEUR` | frais |
| `interestEUR?` | intérêts bancaires — **hors prix de revient** |
| `orderRef`, `source` | référence d'ordre, fichier d'origine |

Autres types : `Position`, `PortfolioSummary`, `ImportRecord`, `SymbolInfo`,
`HistoricalPrice`, `ParseResult`.

`Loan` décrit un emprunt à taux fixe : montant, taux nominal annuel, durée en
mois (différé compris), date de déblocage, mode (`amortizing` = échéances
constantes, `bullet` = in fine), différé (`none`, `partial`, `total`) et sa
durée, assurance mensuelle, frais, et la mensualité annoncée par la banque pour
contrôler la saisie. Un passif n'a ni cours ni position : il suit un
échéancier, d'où un modèle distinct de `Transaction`.

Constantes : `ACCOUNTS` (libellés et couleurs), `SAVINGS_KINDS`, `COIN_SPECS`
(poids d'or fin), `TROY_OUNCE_GRAMS`, `LOAN_KINDS`.

## Parseurs — `src/parsers/`

| Fichier | Source | Détection |
|---|---|---|
| `degiroCsv.ts` | CSV « Transactions » DEGIRO | en-tête contient `DATE` et `PRODUIT` |
| `boursoramaPdf.ts` | avis d'opéré PDF | texte « OPERATION DE BOURSE » |
| `boursoramaAccountCsv.ts` | relevé de compte CSV | en-têtes `Date Opération` + `Libellé Compte` |
| `ledgerCsv.ts` | export Ledger Live | en-têtes `Operation Date` + `Currency Ticker` |
| `goldManual.ts` | saisie manuelle or | — |
| `savingsManual.ts` | saisie manuelle Livret A / cash, solde de départ | — |
| `shared.ts` | utilitaires communs | — |

`shared.ts` porte trois fonctions critiques :
- `parseFrenchNumber` — « 1 234,56 » → nombre ;
- `makeTransactionId` — identité d'une ligne ;
- `mergeTransactions` — fusion **par nombre d'occurrences**.

### Frais : traitement réellement différent selon la source

C'est le point le plus important à connaître avant de toucher aux chiffres.

| Source | `amountEUR` | Frais dans le prix de revient |
|---|---|---|
| DEGIRO | colonne 11 « Montant EUR » (brut converti) | **non** |
| PEA (PDF) | montant net débité | **oui** |
| Ledger | `costEUR + feesEUR` | **oui** (rangés dans `fxFeesEUR`) |
| Or | `prix unitaire × quantité` | sans objet (frais = 0) |
| Livret A / cash | montant du mouvement | sans objet (frais = 0) |

Conséquence : la performance d'un compte DEGIRO est très légèrement flattée par
rapport au PEA, puisque ses frais ne pèsent pas sur le coût. L'écart est faible
(0,5 % des montants) mais réel, et **non intentionnel** — voir TODO.

### Particularités par source

- **Boursorama PDF** : le bloc des totaux imprime tous les libellés puis toutes
  les valeurs ; `readTotals` lit donc la séquence de valeurs et déduit
  `frais = net − brut`. L'heure d'exécution est optionnelle dans la regex, car
  pdf.js et pdftotext n'ordonnent pas le texte pareil.
- **Boursorama compte** : les lignes `*INTER.BRUTS` deviennent des transactions
  à `quantity: 0`, `amountEUR: 0` et `interestEUR` renseigné. La colonne
  « Solde » du fichier est **incohérente** quand plusieurs opérations partagent
  une date ; les opérations font foi et l'écart est signalé à l'import.
- **Ledger** : la contre-valeur est en USD **à la date de l'opération** ; elle
  est convertie au taux de ce jour-là (`buildRateLookup` appelle `/api/history`
  sur `EURUSD=X`). Le prix unitaire est déduit de la contre-valeur.
- **Or** : `coinValueEUR(coinId, ouncePriceUSD, eurUsdRate)` applique le poids
  d'or fin. `goldQuotes` fabrique une cotation synthétique par type de pièce,
  `goldHistory` fait de même sur l'historique.

## Calculs — `src/utils/`

### `calculations.ts`

- `toEur(montant, devise, rates)` — `rates` = unités par 1 EUR.
- `positionKey(tx)` — `tx.symbol || tx.isin || tx.productName` : la seule
  définition de la ligne à laquelle appartient une transaction.
- `buildPositions(txs, symbols, quotes, rates)` — regroupe par `positionKey`,
  garde le nom de produit le plus récent, somme quantités, coûts et frais,
  puis valorise : `currentValueEUR = quantity × toEur(prix, devise, rates)`.
  `avgCostEUR = costEUR / quantity`. `cagrPercent` seulement au-delà d'un an.
  `priced` indique si une cotation a été trouvée.
- `buildSummary(positions, txs)` — totaux, frais, `orderCount` (références
  d'ordre distinctes), CAGR global.
- `summarisePerAccount(txs, positions)` — coût par compte, et valeur répartie
  au prorata quand une position couvre plusieurs comptes.

### `performance.ts` — TWR

`computePerformance(input)` renvoie `{ series, diagnostics }`.

Boucle sur les dates. Pour chaque jour :
1. les achats du jour entrent dans `holdings` et leur coût dans
   `pendingCashFlow` ;
2. le portefeuille est valorisé (prix du jour, sinon dernier connu ; conversion
   au taux du jour) ;
3. si un titre n'a aucun prix, le jour est **ignoré mais les flux sont
   conservés** pour le jour suivant ;
4. `rendement = (valeur − pendingCashFlow) / valeurVeille`, chaîné
   multiplicativement.

Les indices (`^GSPC`, `^NDX`) sont lus par `carryForward` : un marché américain
fermé ne supprime pas une journée européenne.

`diagnostics` expose `skippedDays`, `unappliedCashFlow`, `outliers` (variation
quotidienne > 12 points) et `pointCount`. Un portefeuille sain affiche des zéros.

**Garde connue** : un rendement quotidien `<= 0` est ignoré plutôt que chaîné.
Cela protège des valeurs nulles mais écarterait aussi une journée réellement
catastrophique ; non rencontré en pratique.

### `projection.ts`

- `annualisedReturn(flows, currentValue)` — TRI résolu par **bissection**
  (200 itérations, bornes −0,9 à 3) sur la valeur future des flux datés.
  Renvoie `null` si la racine n'est pas encadrée.
- `wealthStats(transactions, currentValue)` — apports totaux et annuels, gain,
  TRI, et `growthPerYear = currentValue / years`. **Cette dernière formule
  suppose un patrimoine parti de zéro** ; elle serait fausse si l'historique
  importé démarrait sur un solde existant.
- `project(...)` — capitalisation sur 10 ans avec apport annuel constant, plus
  une bande à ±2 points de rendement.

### `loans.ts` — emprunts

`buildLoanSchedule(loan)` produit l'échéancier mois par mois : taux mensuel =
taux nominal / 12, intérêts arrondis au centime, mensualité constante calculée
à la fin du différé sur le capital qui reste, dernière échéance qui solde les
arrondis. En différé partiel on ne paie que les intérêts ; en différé total
ils s'ajoutent au capital. Les échéances tombent chaque mois à partir de la
date de déblocage (même jour, ramené à la fin du mois si besoin).

`loanStatus(loan, schedule, today)` en tire le capital restant dû, le déjà
remboursé, les intérêts payés, les échéances restantes et le coût total
(intérêts, capitalisés compris, assurance et frais). `debtOn` et `totalDebtOn`
donnent la dette à une date : zéro avant le déblocage et après la dernière
échéance. `paymentMismatch` signale une mensualité calculée qui s'écarte de plus
de 5 centimes de celle de la banque.

Validé sur des cas publics (100 000 € à 3 % sur 20 ans = 554,60 € ; 10 000 € à
5 % sur un an = 856,07 €) et contre une implémentation indépendante, échéance
par échéance, pour chaque option.

### `wealthSeries.ts`

`buildWealthSeries` calcule la valeur quotidienne du patrimoine (positions au
cours de clôture converties en euros, plus l'épargne et le cash) ;
`periodStart` borne les périodes YTD, 1 an, 5 ans. Partagé par `WealthChart` et
`NetWealthChart`.

### `store.ts`

Lecture/écriture `localStorage`, chaque accès protégé par `try/catch`.

| Clé | Contenu |
|---|---|
| `portfolio.transactions.v2` | toutes les transactions |
| `portfolio.imports.v2` | historique des imports |
| `portfolio.symbols.v1` | cache ISIN → symbole |
| `portfolio.savings.v1` | solde Livret A saisi à la main |
| `portfolio.loans.v1` | emprunts |

`clearLegacyData()` supprime les clés `v1` obsolètes au démarrage.

### `formatters.ts`

`formatEUR`, `formatMoney`, `formatNumber`, `formatQuantity` (décimales
adaptatives pour la crypto), `formatHolding`, `formatCompactEUR`,
`formatCompactNumber` (capitalisation, volume), `readableTextOn` (noir ou blanc
selon la luminosité d'un fond).

Le module porte aussi le drapeau du **mode discret** (`setDiscreet`,
`isDiscreet`). Quand il est levé, `formatEUR`, `formatCompactEUR`,
`formatQuantity` et `formatHolding` renvoient `•••` ; `formatNumber`,
`formatCompactNumber` et `formatMoney` (prix unitaires, cours de marché) sont
inchangés. Un prix public affiché en euros (cours de l'or) passe donc par
`formatMoney(x, 'EUR')`, pas par `formatEUR`.

### `input.ts` et `dates.ts`

`parseDecimalInput` lit un montant saisi dans un formulaire (« 1 234,56 »,
« 1.234,56 », « 1234.56 ») et renvoie `NaN` s'il est illisible : un
`parseFloat` direct lisait « 1 200 » comme 1. Tous les formulaires s'en servent.
`localToday` et `toLocalISODate` donnent la date du jour **locale** ;
`toISOString` donnerait la veille entre minuit et 2 h en France.

## Exécutable

`npm run package` enchaîne trois étapes :
1. `npm run build` produit l'interface dans `dist/`, puis
   `scripts/third-party-licenses.mjs` y écrit `THIRD_PARTY_LICENSES.txt` : les
   licences de chaque dépendance de production (lues via `package-lock.json`,
   texte compris, y compris les licences d3 que `victory-vendor` range dans ses
   sous-dossiers) et celle de Bun (`scripts/licenses/bun.md`), dont le moteur
   JavaScriptCore est sous LGPL ;
2. `scripts/embed-dist.mjs` la convertit en module JavaScript
   (`build/embedded-assets.js`, fichiers encodés en base64), en **excluant**
   tout fichier de données qu'un build local aurait copié depuis `public/` ;
3. `scripts/package.mjs` compile `server/standalone.js` avec Bun pour
   Windows x64, macOS arm64 et x64, Linux x64, dans `release/`.

L'interface embarquée en mémoire évite toute API d'asset propre à Bun : le même
`standalone.js` tourne sous Node (`npm start`) et une fois compilé.

Au lancement, `standalone.js` écoute sur `127.0.0.1:4719` et ouvre le navigateur
(`start`, `open` ou `xdg-open`). Si le port est pris, il interroge
`/api/health` : si c'est déjà l'application, il rouvre simplement l'onglet ;
sinon il affiche l'erreur et attend Entrée, pour qu'une fenêtre ouverte par
double-clic ne disparaisse pas avant qu'on l'ait lue. `--no-browser` désactive
l'ouverture (tests en CI).

Le pied de page de l'application pointe vers le code source (`SOURCE_URL` dans
`App.tsx`, qu'une version modifiée doit faire pointer vers son propre code,
AGPL §13) et vers `/THIRD_PARTY_LICENSES.txt`. Ce second lien ne fonctionne
qu'avec `npm start` et l'exécutable : en `npm run dev`, le fichier n'est pas
servi.

`.github/workflows/release.yml` : sur un tag `v*`, la CI fabrique les quatre
exécutables sur Linux, lance ceux de Windows, macOS arm64 et Linux sur leur
système (réponse de `/api/health` et de la page), puis publie la release avec
`.github/release-notes.md`. Le binaire macOS Intel n'est pas testé en CI.

## Gestion de l'état — `src/hooks/usePortfolio.ts`

Hook unique (~690 lignes) qui centralise état, réseau et persistance.
Il prend un `scope` (`'all'` ou un compte) et expose notamment :

- `allTransactions` — tout ; `transactions` — filtré par scope **et privé
  d'épargne** (le Livret A n'est pas un investissement) ;
- `positions` (scopé) et `allPositions` (tout, pour Patrimoine, Or, Données) ;
- `summary`, `history`, `spHistory`, `ndxHistory`, `fxHistory`, `rates`,
  `symbols`, `imports`, `accountsPresent`, `unresolvedIsins` ;
- actions : `importFiles`, `addGoldEntry`, `addSavingsDeposit`,
  `addCashMovement`, `setSavingsBalance`, `removeTransaction`,
  `removeTransactionsAt`, `exportBackup`, `restoreBackup`, `resetData`,
  `reload`.

**Amorçage** : l'état initial est lu une seule fois depuis le `localStorage`
(`readStoredPortfolio`, initialiseurs paresseux de `useState`) ; l'effet de
montage ne fait qu'écrire (migration du solde Livret A orphelin, clés
obsolètes) et lancer les requêtes. Au tout premier lancement (ou après
réinitialisation), si un fichier `public/Transactions.csv` existe localement,
il est lu et importé (`readBundledCsv`) ; il est ignoré par git, et son absence
laisse simplement l'application vide. Ensuite le `localStorage` fait foi.

**Données de marché** : chaque changement des transactions relance
`loadMarketData`. Un compteur (`loadId`) écarte le résultat d'un chargement
dépassé par un plus récent, pour qu'une réponse lente n'écrase pas des données
à jour.

**Cotations synthétiques** : or, Livret A et cash n'ont pas de cours de marché.
Leurs `StockQuote` sont fabriquées dans le hook (`goldQuotes`, `savingsQuote`,
`cashQuote`) et injectées dans le tableau passé à `buildPositions`, si bien que
le reste du code les traite comme n'importe quelle ligne. Le solde du Livret A
vient de `savingsBalance` (`savingsManual.ts`), partagé avec la page Épargne :
intérêts d'un relevé importé, sinon solde saisi, sinon somme versée.

`useTheme.ts` gère le thème (classe `dark` sur `<html>`, posée avant l'affichage
par `useLayoutEffect`, mémorisée) et expose `useIsDark()` (abonné à la classe
de `<html>` par `useSyncExternalStore`) / `chartTheme(isDark)` : les graphes
peignent en SVG et ont besoin des couleurs comme **valeurs**, pas comme
classes CSS. `chartTheme().tooltipItem` colore les lignes d'infobulle d'un
camembert, que Recharts écrirait sinon en noir.

`useDiscreet.ts` pilote le mode discret (clé `portfolio.discreet.v1`). Il pose le
drapeau des formateurs **de façon synchrone**, à l'initialisation et au clic,
puis déclenche le re-rendu d'`App` : posé dans un effet, le drapeau arriverait
après le rendu et la page s'afficherait une fois avec l'état précédent.

## Pages et composants

| Page | Fichier | Contenu |
|---|---|---|
| Patrimoine | `src/pages/Wealth.tsx` | total, classes d'actifs, courbe d'évolution, projection, classes non implémentées ; avec au moins un emprunt, carte « Patrimoine net » et courbe brut/net |
| Investissements | `src/pages/Investments.tsx` | répartition par compte, répartition, positions, performance, valeur, distribution, frais |
| Or | `src/pages/Gold.tsx` | cours de l'or, saisie d'achats, lignes enregistrées |
| Épargne | `src/pages/Savings.tsx` | sélecteur Livret A / Cash, soldes, mouvements |
| Emprunts | `src/pages/Loans.tsx` | un bloc par prêt (indicateurs, courbe du restant dû, échéancier), formulaire d'ajout et de modification |
| Données | `src/pages/Data.tsx` | import, état du stockage, historique, toutes les transactions groupées et supprimables |

Un clic sur une ligne cotée du tableau des positions, ou sur sa part, son
étiquette ou sa ligne dans le camembert de répartition, ouvre `InstrumentDetail`,
une fiche à la Google Finance : cours et variation, courbe sur 1 j, 5 j, 1 m,
6 m, YTD, 1 a, 5 a et Max, statistiques du jour. `src/utils/instrumentChart.ts`
retrouve la ou les dernières séances à partir des horaires publiés par Yahoo
(Yahoo renvoie quelques jours de plus pour survivre aux week-ends et aux jours
fériés), écarte le pré-marché et dessine l'après-clôture en gris pour « 1 j »,
et traite une crypto en fenêtres glissantes de 24 h. Les graduations sont
rondes (pas de 1, 2 ou 5) et datées à l'heure de la place de cotation. Or,
Livret A et cash n'ont pas de fiche : leur cours est calculé par l'application.

Composants : `PerformanceChart` (TWR + indices), `WealthChart` (valeur en €,
réutilisé par Patrimoine et Investissements via une prop `title`),
`NetWealthChart` (brut et net, affiché seulement s'il y a un emprunt),
`WealthProjection`, `AllocationChart` (donut étiqueté en mode `wide`),
`AccountBreakdown`, `PositionsTable`, `FeesCard`, `PerformanceDistribution`,
`ValueCard`.

`src/App.tsx` porte la barre latérale, la navigation, le sélecteur de compte
(affiché **uniquement** sur Investissements) et le bouton de thème.

## Flux d'une transaction, de l'import à l'affichage

1. **Dépôt** d'un fichier sur la page Données (`DataPage`), ou saisie manuelle.
2. **Aiguillage** dans `importFiles` (`usePortfolio.ts`) : PDF → Boursorama
   (pdf.js est chargé à ce moment-là, par `import()`, pas au démarrage) ;
   sinon détection au contenu Ledger → relevé Boursorama → DEGIRO.
3. **Parsing** : le parseur renvoie `ParseResult { transactions, warnings }`,
   chaque ligne normalisée en `Transaction` avec un `id` calculé.
4. **Fusion** : `mergeTransactions` compare les occurrences par `id` et ne garde
   que le surplus. Un `ImportRecord` est écrit.
5. **Persistance** : `saveTransactions` écrit dans `localStorage`.
6. **Résolution des symboles** : `ensureSymbols` demande `/api/resolve` pour les
   ISIN inconnus, puis met en cache.
7. **Données de marché** : `loadMarketData` récupère cours, taux et historiques
   (plus `GC=F` pour l'or), et fabrique les cotations synthétiques.
8. **Positions** : `buildPositions` regroupe et valorise ; `buildSummary` totalise.
9. **Affichage** : les pages consomment `positions` / `allPositions` ; les
   graphes recalculent leurs séries (`computePerformance`, `WealthChart`).

## Intégrations externes

- **Yahoo Finance** via `yahoo-finance2` — API non officielle, sans garantie.
  Symboles utilisés : actions/ETF résolus par ISIN, `BTC-EUR`/`ETH-EUR`… pour la
  crypto, `GC=F` pour l'or, `EUR<DEVISE>=X` pour le change, `^GSPC` et `^NDX`
  pour les indices.
- **Caisse des Dépôts** (données ouvertes) — taux du Livret A, indicatif.

- **Google (facultatif)** — connexion OAuth et API Drive, appelées directement
  par le navigateur, seulement si la synchronisation est activée.

Rien d'autre : aucune police web, aucun script ni service tiers. Hors
synchronisation, le navigateur ne parle qu'au serveur local, qui ne transmet que
des codes de titres, de devises et d'indices.

## Synchronisation Google Drive

Trois pièces, du plus pur au plus concret :

- `src/utils/sync.ts` — `mergeThreeWay(base, local, remote)` : transactions
  comptées par identifiant (jumeaux compris) ; pour chaque identifiant, la
  base plus le plus grand ajout moins la plus grande suppression des deux
  côtés, si bien qu'un relevé importé sur deux appareils n'est pas doublé et
  qu'une suppression se propage. Emprunts et imports par `id` : le côté qui a
  modifié gagne, une modification l'emporte sur une suppression. Sans base,
  union (`mergeBackup`). `runSync(store, local, base)` lit la copie, fusionne,
  écrit si elle a bougé et recommence (3 fois au plus) sur `ConflictError`.
- `src/api/googleDrive.ts` — `authorize` (fenêtre Google, `response_type=token`,
  champ d'application `drive.file`, réponse relayée par `public/oauth.html`
  sur le canal `portefeuille-oauth`, vérification du `state`), `driveStore`
  (fichier `portefeuille.json` dans un dossier visible « Portfolio Manager »,
  créé au premier envoi ; retrouvé même déplacé, car `drive.file` ne montre
  que ce que l'appli a créé ; version relue avant chaque écriture ; « supprimer
  la copie » la met à la corbeille et laisse le dossier), `revoke`. `GOOGLE_CLIENT_ID` vide : la synchro n'est pas
  proposée.
- `src/hooks/useDriveSync.ts` — appelé par `usePortfolio` avec les données et
  `applyData`. Jeton en mémoire ; statut `unavailable`, `off`, `signed-out`,
  `syncing`, `synced` ou `error` ; envoi automatique 3 s après la dernière
  modification tant que le jeton est valide ; une modification faite pendant
  un aller-retour est fusionnée par-dessus, puis envoyée au tour suivant.
  Réglages dans `portfolio.sync.v1`, base dans `portfolio.syncBase.v1`.

Interface : carte « Synchronisation Google Drive » de la page Données, et
bouton d'état « Drive : … » dans la barre latérale (icône ☁ sur mobile), qui
synchronise ou reconnecte en un clic. Configuration du client Google :
`docs/GOOGLE_DRIVE.md`.

## Authentification, import/export

- **Authentification** : aucune.
- **Import** : décrit ci-dessus.
- **Sauvegarde** (`src/utils/backup.ts`, carte « Sauvegarde » de la page
  Données) : un fichier JSON `{ app: 'portfolio-tracker', version, exportedAt,
  data }`, où `data` = transactions, historique des imports, symboles résolus,
  solde Livret A saisi et emprunts. Les préférences (thème, mode discret)
  restent propres à chaque appareil.
  - `createBackup` l'écrit ; `parseBackup` valide **chaque** ligne avant toute
    restauration et refuse un fichier d'une version plus récente ;
  - `mergeBackup` ajoute ce qui manque sans rien modifier : transactions par
    `mergeTransactions` (jumeaux comptés), emprunts et imports par `id`,
    symboles et solde saisi seulement s'ils manquent. Une suppression faite sur
    un appareil n'est donc pas transmise par une fusion ;
  - `usePortfolio.restoreBackup(backup, 'merge' | 'replace')` écrit tout dans
    le stockage avant de mettre l'état à jour.
  Changer la forme de `BackupData` impose d'incrémenter `BACKUP_VERSION` et de
  savoir relire les versions précédentes.
