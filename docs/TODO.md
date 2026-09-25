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
(`readBundledCsv`). L'exécutable est déjà protégé (`scripts/embed-dist.mjs`).
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

### Synchronisation entre appareils — étapes 2 et 3
*Fonctionnalité planifiée, plan validé par l'auteur.* L'étape 1 (fichier de
sauvegarde, `src/utils/backup.ts`) est faite.

**Étape 2 — Google Drive.** Connexion Google dans le navigateur, un seul fichier
dans le dossier caché de l'application (`drive.appdata` : l'appli ne voit rien
d'autre du Drive), chiffrement facultatif par mot de passe avant l'envoi, fusion
avec `mergeBackup`. À prévoir : un projet Google Cloud gratuit (identifiant
OAuth, origines autorisées), et le suivi des suppressions pour qu'une ligne
effacée ne revienne pas d'un autre appareil. À trancher : la connexion ajoute
un script Google dans l'interface, contraire à la règle « aucune ressource
tierce » (`docs/DECISIONS.md`).

**Étape 3 — interface en ligne pour le téléphone.** Front statique sur GitHub
Pages (aucune donnée, que du code), et un relais des cours Yahoo (Yahoo refuse
les appels directs d'un navigateur), par exemple Cloudflare Workers, limité à
l'origine du site et à un débit raisonnable. À trancher : l'appli devient
publiquement accessible (sans données).

### Gérer les ventes et les sorties
*Fonctionnalité planifiée.*
Aujourd'hui détectées, signalées puis ignorées. Les chiffres deviendront faux dès
la première vente.
Travail : suivi des lots (FIFO ou PRU) dans `buildPositions`, distinction
plus-value réalisée / latente, traitement des `OUT` Ledger et des retraits.
Fichiers : `src/utils/calculations.ts`, les trois parseurs concernés.

## 🟡 Medium

### Ne pas ranger un compte-titres Boursorama dans DEGIRO
*Bug — attribution de compte.*
Un avis d'opéré Boursorama sans la mention « Compte PEA » est attribué au compte
DEGIRO (`boursoramaPdf.ts`, `account = … ? 'pea' : 'degiro'`). Il faudrait un
compte « CTO Boursorama » dans `ACCOUNTS`, ou refuser le fichier.
Fichiers : `src/parsers/boursoramaPdf.ts`, `src/types/index.ts`.

### Reconnaître un relevé Boursorama qui n'est pas le Livret A
*Bug — attribution de compte.*
Tout CSV de compte Boursorama (`Date opération` + `Libellé compte`) est traité
comme le Livret A : un relevé de compte courant y serait additionné. La colonne
`Libellé compte` permet de vérifier le livret.
Fichier : `src/parsers/boursoramaAccountCsv.ts`.

### Accepter l'export DEGIRO en anglais
*Amélioration — portée.*
La détection exige les en-têtes français (« Date », « Produit ») ; un compte
DEGIRO réglé en anglais exporte « Product » et le fichier est refusé. Les
colonnes étant lues par position, reconnaître les deux en-têtes suffirait.
Fichier : `src/parsers/degiroCsv.ts` (`isDegiroCsv`).

### Choisir la cotation de la place d'exécution
*Bug — affichage.*
Un ETF irlandais acheté en euros à Amsterdam (place `XAMS`) peut être résolu
vers sa cotation londonienne en dollars (suffixe `.L`). La valeur reste juste
(même fonds, converti), mais le PRU s'affiche en dollars avec le montant en
euros. Le CSV DEGIRO donne la place d'exécution : s'en servir pour préférer la
bonne cotation (`XAMS` → `.AS`, `XPAR` → `.PA`…).
Fichiers : `server/api.js` (`/api/resolve`, fonction `score`),
`src/parsers/degiroCsv.ts`.

### Ne plus supposer un patrimoine parti de zéro
*Bug latent.*
`growthPerYear = currentValue / years` serait faux si un import démarrait sur un
solde existant.
Fichier : `src/utils/projection.ts`, `wealthStats`.

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

### Remboursements anticipés
*Fonctionnalité — emprunts.*
Remboursement partiel en cours de prêt, avec réduction de la durée ou de la
mensualité : recalculer l'échéancier à partir de la date du remboursement.
Fichiers : `src/types/index.ts` (`Loan`), `src/utils/loans.ts`,
`src/pages/Loans.tsx`.

### Prêts immobiliers
*Fonctionnalité — emprunts.*
Écartés tant que la valeur du bien n'est pas suivie : sans elle, le patrimoine
net serait fortement sous-évalué. À faire avec la classe Immobilier (déjà
annoncée sur Patrimoine).

### Monter les actions GitHub hors de Node 20
*Maintenance — CI.*
`actions/checkout`, `setup-node`, `upload-artifact`, `download-artifact` en
`@v4` tournent sur Node 20, déprécié par GitHub. Passer aux versions suivantes
quand la CI l'exige, puis relancer une release de test.
Fichier : `.github/workflows/release.yml`.

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
- **Classes d'actifs supplémentaires** — immobilier, assurance-vie, comptes
  courants. Déjà annoncées en pointillés sur la page Patrimoine
  (`src/pages/Wealth.tsx`, tableau `CLASSES`), aucune n'est implémentée.
- **Suivi des dividendes.** Absents des relevés de transactions ; demanderait une
  autre source.
- **Découpage du bundle.** pdf.js est déjà chargé à la demande ; le script
  principal (≈ 820 ko, surtout Recharts et React) déclenche encore
  l'avertissement de 500 ko de Vite. Sans gêne en local.
