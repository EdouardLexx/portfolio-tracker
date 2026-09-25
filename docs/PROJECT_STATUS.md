# Project Status

Photographie du dépôt au 24 septembre 2026, après un audit complet du code.
Établi en lisant le code, pas l'historique de conversation.

## Current state

Application fonctionnelle en local, utilisée au quotidien par son auteur.
`npx tsc -b --noEmit` passe sans erreur, `npm run build` réussit, `npm run lint`
renvoie **0 avertissement, 0 erreur** (une seule exception motivée en
commentaire, dans `usePortfolio.ts`). `npm audit --omit=dev` : 0 vulnérabilité.
Dernière version publiée : tag `v1.3.1`.

Six comptes sont gérés (PEA, DEGIRO, Ledger, or, Livret A, cash), quatre formats
de fichiers sont reconnus, deux modes de saisie manuelle existent.

Limite structurante : **aucun test automatisé**, et aucune dépendance de test
installée. Les vérifications se font à la main dans le navigateur.

Deuxième limite : les données vivent dans le `localStorage` d'**un** navigateur.
Pas de synchronisation automatique ; le transfert se fait par un fichier de
sauvegarde (onglet Données).

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
- Sauvegarde : export du portefeuille dans un fichier, import par fusion ou
  remplacement, avec validation (`src/utils/backup.ts`, page Données).
- Synchronisation Google Drive (`src/utils/sync.ts`, `src/api/googleDrive.ts`,
  `src/hooks/useDriveSync.ts`), en attente de l'identifiant Google.
- Page Données : liste des données compatibles et de leurs limites, tenue à
  jour à la main dans `src/pages/Data.tsx` (`FILE_SOURCES`, `MANUAL_SOURCES`).

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
- Échéancier d'emprunt : échéances constantes ou in fine, différé partiel ou
  total, assurance, frais ; capital restant dû et coût total
  (`src/utils/loans.ts`). Validé sur cas publics et implémentation de référence.

**Interface**
- Six pages : Patrimoine, Investissements, Or, Épargne, Emprunts, Données.
- Patrimoine net et courbe brut/net, affichés seulement s'il y a un emprunt.
- Fiche d'un titre à la Google Finance, depuis le tableau des positions ou le
  camembert de répartition (part, étiquette ou ligne de la liste) : intraday
  avec après-clôture, 8 périodes, statistiques du jour.
- Barre latérale, sélecteur de compte limité à Investissements.
- Graphes : TWR vs S&P 500 et Nasdaq 100, valeur en euros, donut étiqueté,
  distribution, projection.
- Thème clair/sombre mémorisé, graphes et infobulles inclus ; aucune classe de
  couleur sans variante `dark:` (vérifié par balayage des fichiers).
- Mode discret mémorisé : montants et quantités masqués, graphes inclus ;
  vérifié page par page, seuls les cours de marché restent visibles.
- Aucun appel à un service tiers depuis l'interface (police système).

**Distribution**
- Exécutables autonomes Windows, macOS (arm64, x64) et Linux, fabriqués par
  Bun et publiés par GitHub Actions sur tag `v*`.
- Licence AGPL-3.0 ; mentions des licences tierces (dépendances et Bun)
  générées à chaque build, servies par l'application et jointes aux releases.
- Linux testé de bout en bout (import, résolution, cours). Windows et macOS
  arm64 testés en CI au démarrage seulement ; macOS x64 non testé.
- Responsive vérifié à la main (mobile, tablette, large).

## In progress

Rien n'est en chantier dans le code : aucun `TODO`/`FIXME` en commentaire, aucun
module inachevé repéré.

Le projet est versionné sur GitHub, dans un dépôt **public**. Les fichiers de
données (`*.csv`, `*.pdf`, `*.xlsx`) sont exclus par `.gitignore`.

Le dernier travail terminé est un audit complet du code (voir *Recently
changed*), après l'ajout des emprunts, de la fiche d'un titre et du clic depuis
le camembert.

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

### 2. `growthPerYear` suppose un patrimoine parti de zéro

- **Description** : `wealthStats` calcule `growthPerYear = currentValue / years`
  (`src/utils/projection.ts`).
- **Impact** : correct pour l'historique actuel, qui démarre à la création des
  comptes. Deviendrait faux si un import commençait sur un solde préexistant.
- **Piste** : mesurer la valeur au premier point de la série plutôt que de
  supposer zéro.

### 3. `public/Transactions.csv` part dans un build local

- **Description** : le fichier n'est plus versionné, mais s'il existe dans
  `public/` au moment d'un `vite build`, il est copié tel quel dans `dist/`.
- **Impact** : un `dist/` construit sur le poste et déployé exposerait
  l'historique réel des ordres. Sans effet en local ni sur le dépôt.
- **Parade en place** : `scripts/embed-dist.mjs` exclut tout fichier de données
  de l'exécutable, et les releases ne se fabriquent qu'en CI, où le fichier
  n'existe pas.
- **Piste** : sortir l'amorçage de `public/`, ou supprimer le fichier avant de
  construire pour un déploiement.

### 4. Fragilités de dépendances

- **Recharts 2.15 + React 19** : les formes ne se rendent pas si les animations
  sont actives, d'où `isAnimationActive={false}` partout. Une montée de version
  doit être revérifiée graphe par graphe.
- **Yahoo Finance** : API non officielle. Des erreurs `fetch failed` passagères
  ont été observées sous rafale de requêtes ; le serveur les retente désormais
  une fois (`retryOnce`), et un échec persistant répond 502.
- **Recharts et conteneur de largeur nulle** : un graphe monté dans un conteneur
  à 0 px reste vide jusqu'au rechargement. Observé uniquement dans un panneau de
  test replié.

### 5. Choix de cotation et d'attribution de compte

Détaillés dans `docs/TODO.md` (section Medium) : ETF irlandais résolu en
dollars à Londres, compte-titres Boursorama rangé dans DEGIRO, relevé
Boursorama non-Livret A compté comme Livret A, export DEGIRO anglais refusé.

### 6. Actions GitHub en Node 20

`actions/checkout`, `setup-node`, `upload-artifact` et `download-artifact` sont
en `@v4`, qui tournent sur Node 20, déprécié par GitHub. Sans effet tant que
GitHub les accepte ; à monter de version à la prochaine alerte de la CI.

## Recently changed

Du plus récent au plus ancien.

- **Synchronisation Google Drive** (étape 2) : fusion à trois voies, connexion
  Google sans script, carte dans Données et état dans la barre latérale.
  Testée de bout en bout avec un faux Google ; inactive tant que le client
  Google n'est pas créé (`docs/GOOGLE_DRIVE.md`).
- **Sauvegarde et transfert** : carte « Sauvegarde » dans Données (exporter,
  importer en fusionnant ou en remplaçant) ; fichiers de sauvegarde ignorés par
  git et exclus de l'exécutable.

- **Audit complet (septembre 2026)** :
  - positions : le nom affiché est enfin le plus récent ; la clé d'agrégation
    est une seule fonction (`positionKey`), ce qui corrige la répartition par
    compte d'une ligne à symbole détenue sur deux comptes ;
  - saisie : `parseDecimalInput` remplace `parseFloat`, qui lisait « 1 200 »
    comme 1 € (Épargne, Or, Emprunts) ;
  - dates locales dans les formulaires Or et Épargne et dans les périodes des
    graphes ;
  - Données : la colonne « Cours » ne montre plus le montant d'un versement
    Livret A ou cash (fuite en mode discret) ; la sélection se vide si la
    liste change ;
  - Livret A : intérêts importés affichés avec leur montant (et non
    « +0,00 € ») ; calcul du solde partagé (`savingsBalance`) ;
  - thème sombre : bandeaux de résultat, zone de dépôt et pastilles corrigés,
    plus de flash clair au chargement ;
  - `usePortfolio` : état initial lu une fois, chargements périmés écartés ;
  - serveur : nouvelle tentative sur coupure réseau, 502 en cas de panne amont,
    validation de tous les paramètres, requêtes simultanées partagées ;
  - police système au lieu de Google Fonts ; pdf.js chargé à la demande
    (script principal de 1,25 Mo à 820 ko) ; code mort supprimé.
- Camembert : infobulle lisible en thème sombre, clic vers la fiche du titre.
- Fiche d'un titre à la Google Finance (`InstrumentDetail`, `useInstrument`,
  `/api/instrument`, `/api/chart`).
- Livret A : un solde saisi sans mouvement devient un « Solde de départ »,
  compté partout (Patrimoine, Données).
- Onglet Emprunts et patrimoine net.
- Licence AGPL-3.0, mentions des licences tierces.
- Exécutables autonomes multi-plateformes publiés par la CI.
- Mode discret.

## Current focus

Consolidation en local et diffusion aux spectateurs d'un tutoriel YouTube, par
les exécutables. L'auteur a explicitement écarté l'hébergement distant pour
l'instant, au profit d'un fonctionnement propre sur son poste.

## Next steps

Ordre logique, sans engagement :

1. Trancher la convention de frais et aligner les parseurs (issue 1).
2. Ajouter un harnais de test minimal sur les calculs financiers purs
   (`performance.ts`, `calculations.ts`, `projection.ts`, `shared.ts`), qui sont
   déjà écrits comme des fonctions pures.
3. Synchronisation entre appareils, en trois étapes décidées avec l'auteur :
   fichier de sauvegarde (**fait**), synchronisation Google Drive (**codée**,
   à configurer), interface en ligne sur GitHub Pages pour le téléphone (voir
   `docs/TODO.md`).
4. Gérer les ventes et sorties, aujourd'hui ignorées.
