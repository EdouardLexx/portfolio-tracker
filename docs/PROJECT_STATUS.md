# Project Status

Photographie du dépôt à la date de rédaction. Établi en lisant le code, pas
l'historique de conversation.

## Current state

Application fonctionnelle en local, utilisée au quotidien par son auteur.
`npx tsc -b --noEmit` passe sans erreur, `npm run build` réussit, `npm run lint`
renvoie **5 avertissements, 0 erreur**.

Six comptes sont gérés (PEA, DEGIRO, Ledger, or, Livret A, cash), quatre formats
de fichiers sont reconnus, deux modes de saisie manuelle existent.

Limite structurante : **aucun test automatisé**, et aucune dépendance de test
installée. Les vérifications se font à la main dans le navigateur.

Deuxième limite : les données vivent dans le `localStorage` d'**un** navigateur.
Pas de synchronisation, pas d'export.

## Completed

Vérifié dans le code.

**Import et données**
- Parseur CSV DEGIRO (`src/parsers/degiroCsv.ts`).
- Parseur PDF Boursorama via pdf.js (`src/parsers/boursoramaPdf.ts`).
- Parseur CSV Ledger Live (`src/parsers/ledgerCsv.ts`).
- Parseur relevé de compte Boursorama, intérêts compris
  (`src/parsers/boursoramaAccountCsv.ts`).
- Détection du format au contenu, import multi-fichiers.
- Déduplication par occurrences (`src/parsers/shared.ts`).
- Persistance `localStorage` avec clés versionnées (`src/utils/store.ts`).
- Page Données : toutes les transactions groupées par compte, filtre texte,
  sélection multiple et suppression par position (`src/pages/Data.tsx`).
- Historique des imports et réinitialisation.

**Valorisation**
- Résolution ISIN → symbole en trois niveaux, avec cache (`server/api.js`).
- Cours, historiques et taux de change via Yahoo (`src/api/stockApi.ts`).
- Multi-devises, conversion au taux du jour dans les séries historiques.
- Cotations synthétiques pour l'or, le Livret A et le cash.
- Taux du Livret A depuis les données ouvertes de la Caisse des Dépôts.

**Calculs**
- Positions, P&L, pondérations, frais, CAGR conditionnel
  (`src/utils/calculations.ts`).
- TWR avec report des flux et des indices, plus diagnostics
  (`src/utils/performance.ts`).
- TRI par bissection et projection à 10 ans (`src/utils/projection.ts`).

**Interface**
- Cinq pages : Patrimoine, Investissements, Or, Épargne, Données.
- Barre latérale, sélecteur de compte limité à Investissements.
- Graphes : TWR vs S&P 500 et Nasdaq 100, valeur en euros, donut étiqueté,
  distribution, projection.
- Thème clair/sombre mémorisé, graphes inclus.
- Mode discret mémorisé : montants et quantités masqués, graphes inclus.

**Distribution**
- Exécutables autonomes Windows, macOS (arm64, x64) et Linux, fabriqués par
  Bun et publiés par GitHub Actions sur tag `v*`.
- Linux testé de bout en bout (import, résolution, cours). Windows et macOS
  arm64 testés en CI au démarrage seulement ; macOS x64 non testé.
- Responsive vérifié à la main (mobile, tablette, large).

## In progress

Rien n'est en chantier dans le code : aucun `TODO`/`FIXME` en commentaire, aucun
module inachevé repéré.

Le projet est versionné sur GitHub, dans un dépôt **public**. Les fichiers de
données (`*.csv`, `*.pdf`, `*.xlsx`) sont exclus par `.gitignore`.

Le dernier travail terminé porte sur la page Données (accès à toutes les lignes
et suppression) et sur la correction du calcul TWR.

## Known issues

### 1. Traitement des frais incohérent entre sources

- **Description** : `amountEUR` inclut les frais pour le PEA et Ledger, mais les
  exclut pour DEGIRO (colonne « Montant EUR », brut converti).
- **Impact** : le prix de revient DEGIRO est sous-estimé d'environ 0,5 %, donc
  sa performance est légèrement flattée par rapport au PEA. Les comparaisons
  entre comptes ne sont pas strictement homogènes.
- **Cause** : chaque parseur a été écrit séparément en suivant la colonne la plus
  naturelle de son format.
- **Solution tentée** : aucune.
- **Piste** : décider d'une convention unique (frais inclus, probablement) et
  aligner `degiroCsv.ts` sur la colonne « Montant négocié EUR » (index 15).
  Attention : changer cela modifie tous les chiffres historiques affichés.

### 2. Clé d'agrégation incohérente dans `summarisePerAccount`

- **Description** : `buildPositions` regroupe par `tx.symbol || tx.isin ||
  tx.productName`, mais la répartition multi-comptes de `summarisePerAccount`
  compare `(t.isin || t.productName) === p.key`, sans `t.symbol`.
- **Impact** : nul aujourd'hui — les positions à symbole direct (crypto, or,
  épargne) n'existent que dans un seul compte, donc la branche multi-comptes
  n'est jamais atteinte pour elles.
- **Cause** : le champ `symbol` a été ajouté après l'écriture de cette fonction.
- **Piste** : extraire une fonction `positionKey(tx)` et l'utiliser aux deux
  endroits (`src/utils/calculations.ts`).

### 3. Le nom de position retenu n'est pas le plus récent

- **Description** : dans `buildPositions`, `if (tx.date >= b.firstDate) b.name =
  tx.productName` s'exécute après la mise à jour de `firstDate`, si bien que la
  condition est presque toujours vraie et que le dernier nom traité l'emporte.
  Le commentaire annonce pourtant « le nom le plus récent ».
- **Impact** : faible. `name` n'est utilisé qu'en dernier recours, après
  `quote?.name` et `info?.name`.
- **Piste** : comparer explicitement à une `lastDate` distincte.

### 4. `growthPerYear` suppose un patrimoine parti de zéro

- **Description** : `wealthStats` calcule `growthPerYear = currentValue / years`
  (`src/utils/projection.ts`).
- **Impact** : correct pour l'historique actuel, qui démarre à la création des
  comptes. Deviendrait faux si un import commençait sur un solde préexistant.
- **Piste** : mesurer la valeur au premier point de la série plutôt que de
  supposer zéro.

### 5. `public/Transactions.csv` part dans un build local

- **Description** : le fichier n'est plus versionné, mais s'il existe dans
  `public/` au moment d'un `vite build`, il est copié tel quel dans `dist/`.
- **Impact** : un `dist/` construit sur le poste et déployé exposerait
  l'historique réel des ordres. Sans effet en local ni sur le dépôt.
- **Piste** : sortir l'amorçage de `public/`, ou supprimer le fichier avant de
  construire pour un déploiement.

### 6. Code mort — résolu

Les routes `/api/fundamentals`, `/api/exchange-rate` et le type
`StockFundamentals` ont été supprimés.

### 7. Avertissements de lint (5)

- `react(set-state-in-effect)` dans `useTheme.ts` (1) et `usePortfolio.ts` (2).
- `react-hooks(exhaustive-deps)` dans `Data.tsx` (2), autour de `labelOf` et
  `symbols`.
- Impact : aucun comportement fautif observé.

### 8. Fragilités de dépendances

- **Recharts 2.15 + React 19** : les formes ne se rendent pas si les animations
  sont actives, d'où `isAnimationActive={false}` partout. Une montée de version
  doit être revérifiée graphe par graphe.
- **Yahoo Finance** : API non officielle. Des erreurs `fetch failed` passagères
  ont été observées sous rafale de requêtes ; elles se résorbent seules.
- **Recharts et conteneur de largeur nulle** : un graphe monté dans un conteneur
  à 0 px reste vide jusqu'au rechargement. Observé uniquement dans un panneau de
  test replié.

## Recently changed

- Calcul TWR extrait dans `src/utils/performance.ts` et corrigé : les flux d'un
  jour non valorisable sont reportés, les indices sont reportés à leur dernière
  valeur. Auparavant un achat tombant un jour férié américain était compté comme
  un gain.
- Page Données : accès à **toutes** les lignes, groupées par compte, avec filtre
  et suppression multiple par position.
- Onglet Épargne remplaçant Livret A, avec sélecteur Livret A / Cash.
- Relevé de compte Boursorama pris en charge, intérêts reconnus.
- Page Patrimoine : courbe d'évolution et bloc « Rythme et projection ».
- Fusion de Résumé et Positions en un onglet Investissements, réordonné.
- Thème sombre, couleur de texte par défaut posée sur `body`, pastilles de
  compte à contraste adaptatif.
- Suppression du panneau de statistiques fondamentales.

## Current focus

Consolidation en local. L'auteur a explicitement écarté l'hébergement distant
pour l'instant, au profit d'un fonctionnement propre sur son poste.

Le travail récent porte sur la fiabilité des calculs (audit du TWR) et sur le
contrôle des données (consultation et suppression).

## Next steps

Ordre logique, sans engagement :

1. Trancher la convention de frais et aligner les parseurs (issue 1).
2. Ajouter un harnais de test minimal sur les calculs financiers purs
   (`performance.ts`, `calculations.ts`, `projection.ts`, `shared.ts`), qui sont
   déjà écrits comme des fonctions pures.
3. Export/import JSON des données, qui sert à la fois de sauvegarde et de
   transfert entre navigateurs.
4. Gérer les ventes et sorties, aujourd'hui ignorées.
