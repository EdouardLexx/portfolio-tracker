# TODO

Rien ici n'est engagé. Les sections séparent les corrections des idées.
Détails des problèmes : `docs/PROJECT_STATUS.md`, section *Known issues*.

## 🔴 Critical

### Trancher la convention de frais et aligner les parseurs
*Bug — cohérence financière.*
`amountEUR` inclut les frais pour le PEA et Ledger, les exclut pour DEGIRO
(colonne « Montant EUR », brut converti). La performance DEGIRO est donc
légèrement flattée et les comptes ne sont pas comparables entre eux.
Fichiers : `src/parsers/degiroCsv.ts` (colonne 15 « Montant négocié EUR » comme
alternative), `src/parsers/boursoramaPdf.ts`, `src/parsers/ledgerCsv.ts`.
Dépendance : décision utilisateur — modifier ceci change tous les chiffres
historiques affichés.

### Vérifier `dist/` avant tout déploiement
*Risque — confidentialité.*
`public/Transactions.csv` n'est plus versionné, mais s'il existe localement, un
`vite build` le copie dans `dist/` avec l'historique réel des ordres.
Fichiers : `public/Transactions.csv`, `src/hooks/usePortfolio.ts`
(`seedFromBundledCsv`).
Dépendance : uniquement si un déploiement est envisagé.

## 🟠 High

### Harnais de test sur les calculs financiers
*Amélioration — fiabilité.*
Aucun test n'existe, aucune dépendance de test n'est installée. Les modules
concernés sont déjà des fonctions pures, donc directement testables.
Cibles prioritaires : `src/utils/performance.ts` (report des flux, indices
reportés, cas à prix constant), `src/utils/calculations.ts` (positions, frais,
CAGR conditionnel), `src/parsers/shared.ts` (fusion des jumeaux),
`src/utils/projection.ts` (TRI sur cas connus).
Contexte : le bug TWR corrigé récemment aurait été pris par un test.

### Export / import des données
*Fonctionnalité planifiée.*
Les données vivent dans un seul navigateur, sans sauvegarde ni transfert. Un
export JSON servirait des deux.
Fichiers : `src/utils/store.ts`, `src/pages/Data.tsx`.
Dépendance : prérequis de fait à tout usage sur un second appareil.

### Gérer les ventes et les sorties
*Fonctionnalité planifiée.*
Aujourd'hui détectées, signalées puis ignorées. Les chiffres deviendront faux dès
la première vente.
Travail : suivi des lots (FIFO ou PRU) dans `buildPositions`, distinction
plus-value réalisée / latente, traitement des `OUT` Ledger et des retraits.
Fichiers : `src/utils/calculations.ts`, les trois parseurs concernés.

## 🟡 Medium

### Choisir la cotation de la place d'exécution
*Bug — affichage.*
Un ETF irlandais acheté en euros à Amsterdam (`IE00B4L5Y983`, place `XAMS`) est
résolu vers sa cotation londonienne en dollars (`IWDA.L`). La valeur reste juste
(même fonds, converti), mais le PRU s'affiche en dollars avec le montant en
euros. Le CSV DEGIRO donne la place d'exécution : s'en servir pour préférer la
bonne cotation (`XAMS` → `.AS`, `XPAR` → `.PA`…).
Fichiers : `server/api.js` (`/api/resolve`, fonction `score`),
`src/parsers/degiroCsv.ts`.

### Unifier la clé de position
*Bug latent.*
`buildPositions` regroupe par `tx.symbol || tx.isin || tx.productName`, mais
`summarisePerAccount` compare `(t.isin || t.productName) === p.key`. Sans effet
aujourd'hui, faux dès qu'une position à symbole direct couvrira deux comptes.
Fichier : `src/utils/calculations.ts` — extraire un `positionKey(tx)` partagé.

### Corriger le choix du nom de position
*Bug mineur.*
Le commentaire annonce « le nom le plus récent », le code retient le dernier nom
traité. Impact faible, `name` ne sert qu'en dernier recours.
Fichier : `src/utils/calculations.ts`, `buildPositions`.

### Ne plus supposer un patrimoine parti de zéro
*Bug latent.*
`growthPerYear = currentValue / years` serait faux si un import démarrait sur un
solde existant.
Fichier : `src/utils/projection.ts`, `wealthStats`.

### Traiter les avertissements de lint
*Amélioration.*
Cinq avertissements, zéro erreur : `set-state-in-effect` dans `useTheme.ts` et
`usePortfolio.ts`, `exhaustive-deps` dans `Data.tsx` autour de `labelOf`.

## 🟢 Low

### Activer `strict` en TypeScript
Aucun `strict` n'est déclaré dans `tsconfig*.json`. L'activer révélera sans doute
des `null` non gardés, notamment autour des cotations manquantes.

### Suivre la prime numismatique de l'or
Les pièces sont valorisées au poids d'or fin ; elles s'échangent au-dessus.
Aujourd'hui contourné en saisissant le montant réellement payé.

### Revoir la garde sur les rendements quotidiens négatifs
`computePerformance` ignore un rendement quotidien `<= 0` au lieu de le chaîner.
Protège des valeurs nulles, mais écarterait aussi une journée réellement
catastrophique.
Fichier : `src/utils/performance.ts`.

### Signer les exécutables
*Amélioration — confiance.*
Sans signature, Windows et macOS avertissent au premier lancement. Signature
Windows (certificat payant) et notarisation Apple (programme développeur à
99 $/an) à ajouter dans `.github/workflows/release.yml`.

## Future ideas

Discutées, non engagées. Ne pas traiter comme des tâches.

- **Hébergement distant.** Options examinées : Tailscale vers le poste (gratuit,
  données non exposées, PC allumé requis), Vercel ou Netlify en gratuit
  (backend à découper en fonctions serverless), Render (réveil lent).
  Explicitement reporté : priorité à un fonctionnement local propre.
- **Synchronisation entre appareils.** Impliquerait une base de données et une
  authentification. Seule voie pour voir la même chose sur téléphone et PC.
- **Classes d'actifs supplémentaires** — immobilier, assurance-vie, comptes
  courants. Déjà annoncées en pointillés sur la page Patrimoine
  (`src/pages/Wealth.tsx`, tableau `CLASSES`), aucune n'est implémentée.
- **Suivi des dividendes.** Absents des relevés de transactions ; demanderait une
  autre source.
- **Découpage du bundle.** Le build avertit qu'un chunk dépasse 500 ko.
