# Portefeuille

Suivi de portefeuille multi-comptes avec valorisation en direct via Yahoo Finance.

## Version en ligne

**https://edouardlexx.github.io/portfolio-tracker/**, sur ordinateur comme sur
téléphone, sans rien installer. Le site ne contient que l'application : vos
données restent dans votre navigateur, et dans votre Google Drive si vous
activez la synchronisation (bouton Google Drive en haut à gauche), ce qui vous
permet de retrouver le même portefeuille sur tous vos appareils.

## Installation

Pour l'utiliser sur votre ordinateur, sans passer par Internet pour l'interface,
rien à installer non plus : on télécharge un fichier, on le lance, et
l'application s'ouvre dans le navigateur.

| Votre ordinateur | Fichier à télécharger |
|---|---|
| Windows | [**portfolio-tracker-windows-x64.exe**](https://github.com/EdouardLexx/portfolio-tracker/releases/latest/download/portfolio-tracker-windows-x64.exe) |
| Mac récent (puce Apple M1, M2, M3…) | [**portfolio-tracker-macos-arm64.zip**](https://github.com/EdouardLexx/portfolio-tracker/releases/latest/download/portfolio-tracker-macos-arm64.zip) |
| Mac plus ancien (processeur Intel) | [**portfolio-tracker-macos-x64.zip**](https://github.com/EdouardLexx/portfolio-tracker/releases/latest/download/portfolio-tracker-macos-x64.zip) |
| Linux | [**portfolio-tracker-linux-x64.tar.gz**](https://github.com/EdouardLexx/portfolio-tracker/releases/latest/download/portfolio-tracker-linux-x64.tar.gz) |

Ces liens mènent toujours à la dernière version. Toutes les versions sont sur la
page [Releases](https://github.com/EdouardLexx/portfolio-tracker/releases).

> L'application n'est pas signée (la signature est payante) : Windows et macOS
> affichent donc un avertissement au premier lancement. Les étapes ci-dessous
> montrent comment le passer. Le code est public, et ces fichiers sont fabriqués
> automatiquement par GitHub à partir de ce dépôt.

### Windows

1. Téléchargez [le fichier `.exe`](https://github.com/EdouardLexx/portfolio-tracker/releases/latest/download/portfolio-tracker-windows-x64.exe). Si le
   navigateur le signale comme rarement téléchargé, choisissez **Conserver**.
2. Ouvrez votre dossier **Téléchargements** et double-cliquez sur
   `portfolio-tracker-windows-x64.exe`.
3. Windows affiche « Windows a protégé votre ordinateur » : cliquez sur
   **Informations complémentaires**, puis sur **Exécuter quand même**.
4. Une fenêtre noire s'ouvre, puis l'application apparaît dans votre navigateur.
   Laissez la fenêtre noire ouverte pendant l'utilisation.

L'avertissement de l'étape 3 n'apparaît qu'au premier lancement.

### macOS

Pour savoir quel fichier prendre : menu Apple (la pomme en haut à gauche) →
**À propos de ce Mac**. « Puce Apple M… » : prenez la version *arm64*.
« Processeur Intel » : la version *x64*.

1. Téléchargez le fichier `.zip` correspondant. Safari le décompresse tout seul ;
   sinon, double-cliquez dessus dans **Téléchargements**.
2. Double-cliquez sur le fichier extrait (`portfolio-tracker-macos-arm64` ou
   `-x64`). macOS refuse de l'ouvrir : cliquez sur **Terminé**.
3. Ouvrez **Réglages Système → Confidentialité et sécurité**, descendez jusqu'au
   message indiquant que `portfolio-tracker…` a été bloqué, et cliquez sur
   **Ouvrir quand même**. Confirmez avec votre mot de passe ou Touch ID.
4. Double-cliquez à nouveau sur le fichier : une fenêtre Terminal s'ouvre, puis
   l'application apparaît dans votre navigateur. Laissez le Terminal ouvert
   pendant l'utilisation.

Les étapes 2 et 3 ne sont nécessaires qu'au premier lancement.

### Linux

1. Téléchargez [l'archive `.tar.gz`](https://github.com/EdouardLexx/portfolio-tracker/releases/latest/download/portfolio-tracker-linux-x64.tar.gz).
2. Dans un terminal, depuis le dossier de téléchargement :

   ```bash
   tar -xzf portfolio-tracker-linux-x64.tar.gz
   ./portfolio-tracker-linux-x64
   ```

3. L'application s'ouvre dans votre navigateur. Si rien ne s'ouvre, allez sur
   http://127.0.0.1:4719.

### Arrêter, relancer, mettre à jour

- **Arrêter** : fermez la fenêtre noire (Windows) ou le Terminal (macOS), ou
  faites `Ctrl+C` dans le terminal (Linux).
- **Relancer** : double-cliquez à nouveau sur le fichier. S'il tourne déjà, cela
  rouvre simplement l'onglet.
- **Mettre à jour** : téléchargez la nouvelle version et lancez-la à la place de
  l'ancienne. Vos données sont conservées.

### Vos données

Tout reste sur votre ordinateur, dans votre navigateur : aucun compte, aucun
envoi de vos relevés. Seuls les codes des titres (ISIN, symboles) partent vers
Yahoo Finance pour obtenir les cours. Deux conséquences : **vider les données de
navigation efface le portefeuille**, et chaque navigateur (ou chaque adresse,
comme `npm run dev` et l'exécutable) a le sien.

**Sauvegarder et transférer** : onglet **Données** → **Sauvegarde**.
« Exporter une sauvegarde » télécharge tout le portefeuille dans un fichier
(`portefeuille-sauvegarde-AAAA-MM-JJ.json`) ; « Importer une sauvegarde » le
recharge sur un autre navigateur ou appareil, soit en **fusionnant** (ajoute ce
qui manque, sans rien effacer), soit en **remplaçant tout**. Le fichier contient
vos données en clair : gardez-le pour vous.

**Synchroniser avec Google Drive** (facultatif) : onglet **Données** →
**Synchronisation Google Drive**. Chaque appareil connecté au même compte
Google retrouve le même portefeuille ; ajouts, modifications et suppressions
passent de l'un à l'autre. L'application range un seul fichier dans un dossier
« Portfolio Manager » de votre Drive, et n'a accès qu'aux fichiers qu'elle a
créés : rien d'autre de votre Drive. Tant que la
synchronisation n'est pas activée, l'application ne contacte jamais Google. La
connexion dure environ une heure, puis un clic sur « Drive : se connecter »
(barre latérale) la renouvelle. Configuration côté Google (une fois, pour qui
compile l'application) : [`docs/GOOGLE_DRIVE.md`](docs/GOOGLE_DRIVE.md).

**Limite importante** : les ventes ne sont pas encore prises en compte. Si vous
avez déjà vendu des titres, les chiffres affichés seront faux. Cet outil ne
constitue pas un conseil en investissement.

Sources reconnues :

| Compte | Format | Fichier | À savoir |
|---|---|---|---|
| CTO DEGIRO | CSV | export « Transactions » | interface DEGIRO en français ; ventes ignorées |
| PEA Boursorama | PDF | avis d'opéré (« OPERATION DE BOURSE »), un par exécution | ventes ignorées ; pas encore les avis d'un compte-titres Boursorama |
| Crypto Ledger | CSV | export « operations » de Ledger Live | réceptions confirmées seulement ; envois ignorés |
| Livret A | CSV | export « opérations » Boursorama du livret | relevé du Livret A uniquement |
| Or physique | saisie manuelle | onglet **Or** : pièce, date, nombre, prix payé | Vreneli, Napoléon, Krugerrand |
| Cash (billets) | saisie manuelle | onglet **Épargne** → Cash | |
| Emprunts | saisie manuelle | onglet **Emprunts** | hors prêts immobiliers et remboursements anticipés |

Le format est reconnu au contenu du fichier, pas à son nom. La même liste
figure dans l'application, page **Données**.

## Navigation

- **Patrimoine** — tout additionné, par classe d'actifs, la courbe d'évolution
  du total, puis le rythme d'épargne et la projection à 10 ans. Les classes non
  implémentées (immobilier, assurance-vie, comptes courants) y sont listées en
  pointillés pour montrer où elles se brancheraient.
- **Investissements** — dans l'ordre : répartition par compte, répartition,
  positions, performance (en %), valeur (en €), distribution et frais.
  Les deux courbes se suivent : l'une mesure le rendement, l'autre ce que ça
  pèse. Le sélecteur **Tous les comptes /
  PEA / DEGIRO / Ledger / Or** ne s'affiche que sur cette page, la seule où
  plusieurs comptes cohabitent. Un clic sur un titre (son nom dans le tableau,
  sa part ou son étiquette dans le camembert, sa ligne dans la liste) ouvre sa **fiche**,
  à la manière de Google Finance : cours et variation, courbe sur 1 jour
  (après-clôture en gris), 5 jours, 1 mois, 6 mois, depuis janvier, 1 an, 5 ans
  ou depuis la cotation, et les chiffres du jour (ouverture, plus haut, plus
  bas, capitalisation, PER, dividende, extrêmes sur 52 semaines, volume).
- **Or** — saisie manuelle des pièces.
- **Épargne** — Livret A et cash, via un sélecteur. Ni l'un ni l'autre
  n'apparaît dans Investissements : ce ne sont pas des placements.
- **Emprunts** — prêts étudiant, conso, auto : on saisit les conditions (montant,
  taux, durée, date de déblocage, différé, assurance, frais) ; le capital
  restant dû, ce qui est déjà remboursé, les échéances à venir et le coût total
  se calculent, avec l'échéancier complet. Dès qu'un emprunt existe, Patrimoine
  affiche aussi le **patrimoine net** (brut moins capital restant dû) et une
  courbe brut/net ; sans emprunt, rien ne change.
- **Données** — imports, et **toutes** les transactions groupées par compte,
  filtrables et supprimables (sélection multiple).

Le thème clair/sombre se change en bas de la barre latérale et se retient par
navigateur ; à défaut il suit le réglage du système. La couleur de texte par
défaut est posée sur `body` dans `index.css` : sans cela, tout élément sans
classe de couleur resterait noir sur fond sombre.

Le **mode discret**, juste au-dessus, remplace par `•••` tout ce qui révèle la
taille du patrimoine : montants en euros (graphes compris) et quantités détenues.
Pourcentages, prix unitaires et cours de marché (cours de l'or, fiche d'un titre)
restent visibles, puisqu'ils ne disent pas combien on possède. Pratique pour une capture d'écran ; le choix se retient par
navigateur.

## Lancer depuis le code

Il faut Node.js 20.19+ ou 22.12+.

```bash
npm install
npm start         # construit l'app et l'ouvre sur http://127.0.0.1:4719
npm run dev       # développement : http://localhost:5173, API sur 3001
```

`npm start` sert exactement ce que contient l'exécutable ; `npm run dev` recharge
à chaud pendant qu'on modifie le code. Les deux adresses sont des origines
différentes pour le navigateur, donc des données séparées.

`npm run package` fabrique les exécutables des quatre plateformes dans
`release/` ; il demande [Bun](https://bun.sh), qui sait compiler pour Windows,
macOS et Linux depuis une seule machine. Publier une version se fait en poussant
un tag (`git tag v1.0.0 && git push --tags`) : GitHub Actions fabrique les
exécutables, les lance sur Windows, macOS et Linux, puis crée la release.

## Architecture

Tout converge vers un modèle unique, `Transaction` (`src/types/index.ts`) : une
exécution, son compte, sa devise et son montant EUR réel. Les pages, les calculs
et les graphes ne connaissent que ce modèle — les particularités de chaque
courtier s'arrêtent à son parseur.

- **`server/api.js`** — API Express sur Yahoo Finance (`yahoo-finance2`) : résolution
  ISIN → symbole, cours, historiques, taux de change, et le taux du Livret A.
  Tout est mis en cache (1 min pour les cours, 15 min pour les historiques,
  24 h pour la résolution des ISIN et le taux du Livret A).
- **`server.js`** — point d'entrée de développement : sert l'API sur le port 3001.
- **`server/standalone.js`** — point d'entrée de l'exécutable : sert l'API et
  l'interface sur le port 4719, puis ouvre le navigateur.
- **`src/parsers/`** — un fichier par source : `degiroCsv.ts`, `boursoramaPdf.ts`
  (chargé seulement au premier PDF), `ledgerCsv.ts`, `boursoramaAccountCsv.ts`,
  `goldManual.ts`, `savingsManual.ts`, et `shared.ts` pour la fusion
  dédupliquée commune.
- **`src/hooks/usePortfolio.ts`** — l'orchestrateur : état, appels réseau,
  persistance. `useInstrument.ts` charge à part les cours éphémères de la fiche
  d'un titre.
- **`src/hooks/useTheme.ts`** — thème clair/sombre, et les couleurs que les
  graphiques ne peuvent pas prendre via des classes CSS.
- **`src/hooks/useDiscreet.ts`** — mode discret, mémorisé par navigateur.
- **`src/utils/store.ts`** — persistance `localStorage` : transactions, historique
  des imports, symboles résolus, solde saisi du Livret A, emprunts.
- **`src/utils/calculations.ts`** — positions, P&L, pondérations, conversion des
  devises, totaux par compte. À côté : `performance.ts` (TWR), `projection.ts`,
  `loans.ts` (échéanciers), `wealthSeries.ts`, `instrumentChart.ts` (courbes de
  la fiche), `input.ts` (lecture des montants saisis).
- **`public/Transactions.csv`** — amorçage facultatif : s'il existe localement,
  il est importé à la première ouverture (et après une réinitialisation). Il
  est ignoré par git ; sans lui, l'application démarre vide.

Le détail (routes, clés de stockage, flux d'une transaction) est dans
[`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md), les choix et leurs raisons dans
[`docs/DECISIONS.md`](docs/DECISIONS.md), l'état et les bugs connus dans
[`docs/PROJECT_STATUS.md`](docs/PROJECT_STATUS.md), la suite dans
[`docs/TODO.md`](docs/TODO.md). [`CLAUDE.md`](CLAUDE.md) résume tout cela, avec
les règles à respecter, pour reprendre le projet dans une nouvelle session
Claude Code.

## Gestion des données

La page **Données** importe un CSV ou plusieurs PDF d'un coup ; le compte est
déduit du contenu du fichier. L'historique se cumule et survit aux rechargements.

**Déduplication** — un même ordre est souvent éclaté par le courtier en plusieurs
lignes d'exécution strictement identiques, et ces lignes sont toutes légitimes :
dédupliquer sur le contenu les écraserait. La fusion compare donc le *nombre
d'occurrences* de chaque ligne et garde le maximum entre l'existant et le fichier
importé. Ré-importer un export complet n'ajoute rien, un export partiel n'ajoute
que les nouveautés, et les exécutions fractionnées sont préservées.

**Suppression de lignes** — les lignes se suppriment depuis la page Données,
par **position dans le tableau** et non par identifiant : les exécutions
fractionnées d'un même ordre partagent volontairement un identifiant (c'est ce
qui fait marcher le comptage d'occurrences), donc supprimer par identifiant
effacerait d'un coup toutes les lignes d'un ordre fractionné. Une ligne supprimée revient au
prochain import du fichier d'origine, puisque la fusion compare les occurrences.

**Identification par ISIN** — les titres sont agrégés par ISIN, jamais par nom :
un ETF renommé après un changement d'émetteur (cas réel du marché : la gamme
Lyxor reprise par Amundi) garde son ISIN, donc reste la même ligne.

**Résolution des symboles** — l'ISIN est traduit en symbole Yahoo automatiquement,
en trois niveaux : table d'exceptions (classes d'actions, que Yahoo n'indexe pas),
puis recherche par ISIN, puis repli sur le nom du produit nettoyé. Le résultat est
mis en cache. Un ISIN qui échoue aux trois est signalé sur la page Données et
exclu de la valorisation plutôt que compté à zéro.

## Particularités du compte Ledger

**Pas d'ISIN.** Une transaction peut porter directement son symbole de marché
(champ `symbol`), et les positions sont alors regroupées par ce symbole. Les
cryptos sont cotées en paires `-EUR` (`BTC-EUR`, `ETH-EUR`), ce qui évite toute
conversion de change pour la valorisation.

**Prix de revient.** Ledger donne la contre-valeur en USD *à la date de
l'opération*. Elle est convertie en euros au taux de ce jour-là — le taux du jour
créerait une performance de change fictive. Le prix unitaire est déduit de cette
contre-valeur, ce qui permet aussi de chiffrer les frais de réseau sans requête
supplémentaire.

**Ce qui est retenu.** Seules les opérations `IN` confirmées sont importées, et
leur contre-valeur à réception sert de prix de revient. Les `OUT` et les
opérations non confirmées sont signalées à l'import puis ignorées.

## Or physique

Les pièces n'ont pas de cotation propre : leur valeur est **synthétisée** à
partir du cours de l'or (`GC=F`, futures COMEX en USD l'once), converti en euros.
`goldQuotes` fabrique une cotation par type de pièce, si bien que le reste de
l'application les traite comme n'importe quelle ligne.

La valeur retenue est celle du **poids d'or fin** : une pièce de 20 francs de
l'Union latine (Vreneli, Napoléon) pèse 6,45161 g à 900/1000, soit 5,80645 g
d'or pur ; un Krugerrand contient exactement une once. Ajouter un autre type de
pièce se fait en une entrée dans `COIN_SPECS` (`src/types/index.ts`).

Le prix de revient est celui **saisi**, ou à défaut le cours de l'or **à la date
d'achat**. Les deux ignorent la prime de collection appliquée en boutique : une
pièce achetée chez un numismate a coûté plus que son poids d'or, donc renseigner
le montant réellement payé donne une performance plus juste.

## Épargne

**Livret A.** L'export d'opérations Boursorama contient tout : les virements
*et* les intérêts annuels (lignes `*INTER.BRUTS`). Les intérêts portent un champ
`interestEUR` distinct de `amountEUR`, si bien qu'ils augmentent le solde sans
jamais gonfler le capital versé — c'est ce qui permet d'afficher une performance
juste. Solde = versements nets + intérêts.

Attention à la colonne « Solde » du fichier : Boursorama la remplit de façon
incohérente dès que plusieurs opérations partagent une date. Les **opérations
font foi**, et l'écart avec cette colonne est signalé à l'import plutôt que
tranché en silence.

Une saisie manuelle reste possible sans relevé. On commence par le **solde de
départ** du livret : il est enregistré comme un mouvement, compté comme apport,
et les intérêts se mesurent à partir de lui. On ajoute ensuite les versements,
puis on met le solde à jour quand la banque verse les intérêts. Importer un
relevé efface ce solde manuel, devenu moins fiable que les opérations.

Le **taux en vigueur** vient des données ouvertes de la Caisse des Dépôts (jeu
`flux-et-taux-la-ldds-lep`, l'opérateur du Livret A), mis en cache 24 h. Il est
indicatif : aucun intérêt n'en est déduit, les lignes du relevé font foi.

**Cash.** Des mouvements datés, positifs pour un retrait au distributeur, négatifs
pour une dépense. Ni cours ni rendement : la valeur est exactement la somme des
mouvements.

Les deux tiennent **une seule unité** valorisée au solde, plutôt qu'une unité par
euro : sans cela la valeur suivrait les versements et les intérêts
n'apparaîtraient jamais.

## Ajouter une source

Il n'y a rien à changer dans l'interface :

1. Ajouter le compte à `ACCOUNTS` (`src/types/index.ts`) : le sélecteur, les
   pastilles de couleur et la répartition par compte s'y adaptent seuls.
2. Écrire `src/parsers/<source>.ts` qui renvoie un `ParseResult`, en construisant
   les identifiants avec `makeTransactionId` (`src/parsers/shared.ts`) pour
   hériter de la déduplication.
3. Le brancher dans `importFiles` (`src/hooks/usePortfolio.ts`), en détectant le
   format au contenu comme le font `isLedgerCsv` / `isDegiroCsv`.

## Courbes de valeur

`WealthChart` sert les deux pages : le patrimoine entier sur Patrimoine, les
seuls placements sur Investissements (où elle suit le filtre de compte). Elle
trace une **valeur en euros**, versements compris — ce n'est donc pas une mesure
de performance, et la légende le dit, sinon la hausse due aux apports se lirait
comme un rendement. C'est précisément ce que le TWR du bloc Performance sépare.

Livret A et cash n'ont pas de cours : leur solde avance au fil des mouvements et
des intérêts, et s'ajoute à la valeur de marché des placements.

## Rythme et projection

Le bloc sépare trois chiffres que l'on confond facilement :

- **Patrimoine gagné par an** — accumulation totale, apports et gains mélangés ;
- **Apports** — ce qui sort de la poche, la part que l'on contrôle vraiment ;
- **Rendement annualisé (TRI)** — un taux de rentabilité interne résolu par
  bissection sur tous les flux datés (`src/utils/projection.ts`). Un simple
  rapport valeur/coût le surestimerait : l'argent versé le mois dernier n'a pas
  travaillé aussi longtemps que celui d'il y a deux ans.

La projection compose le patrimoine actuel au TRI en y ajoutant l'apport annuel
habituel, sur 10 ans. La bande couvre ±2 points de rendement, et la courbe en
pointillés montre où l'on arriverait **sans aucun rendement** — l'écart entre les
deux est la contribution des marchés. Le taux est ajustable (2 à 8 %) pour voir
ce qui tient à l'hypothèse plutôt qu'aux versements.

C'est une projection, pas une prévision : elle suppose que le passé se répète,
ignore l'inflation et la fiscalité, et les marchés ne progressent pas en
moyennes régulières.

## Notes sur les calculs

Le calcul du TWR vit dans `src/utils/performance.ts`, hors du composant, pour
être testable sur des cas dont on connaît la réponse. Il renvoie aussi un objet
`diagnostics` (jours non valorisés, flux non appliqué, variations aberrantes) :
un portefeuille sain affiche des zéros partout.

Deux pièges y sont traités explicitement :

- **Un jour non valorisable ne doit pas avaler ses achats.** Si un titre n'a pas
  encore de cours ce jour-là, le versement est mis de côté (`pendingCashFlow`) et
  déduit au premier jour valorisable suivant. Sans cela l'argent versé se lit
  comme un gain — sur un cas test, +100 % de performance fictive.
- **Un indice fermé ne doit pas supprimer un jour de Bourse.** Le S&P 500 et le
  Nasdaq sont reportés à leur dernière valeur connue plutôt que de faire sauter
  la journée : les jours fériés américains sont ouvrés à Paris, et le PEA y
  bougeait sans être compté.

**TWR (performance du graphe)** — rendement pondéré par le temps : on chaîne les
rendements quotidiens en neutralisant les apports d'argent. C'est la mesure
utilisée pour se comparer à un indice, car elle ne dépend pas du *moment* où
l'argent a été versé. Elle diffère volontairement de la plus-value latente :
un gain réalisé quand le portefeuille était petit pèse autant qu'un gain tardif
sur un portefeuille important.

Le graphe est calculé en euros, en convertissant chaque jour au taux de change
*de ce jour-là* (historique `EURUSD=X`) : les apports sont des montants EUR réels,
donc les valoriser au taux du jour créerait une fausse performance de change. Les
indices de comparaison (S&P 500 `^GSPC`, Nasdaq 100 `^NDX`) sont rebasés à 0 % au
début de la période affichée, comme le portefeuille.

Sur la vue combinée, le TWR peut dépasser celui de chaque compte pris séparément.
Ce n'est pas une erreur : la période commune démarre au premier achat tous comptes
confondus, et sur la partie où les deux coexistent, le mélange peut faire mieux
que le compte le plus ancien.

**CAGR** — affiché seulement au-delà d'un an de détention. En deçà, annualiser
produit des valeurs absurdes (25 jours de détention à +30 % donnerait +4000 %/an).

**Frais** — affichés séparément dans la carte Frais de la page Investissements.
Leur place dans le prix de revient **dépend de la source** : inclus pour le PEA
(montant net de l'avis d'opéré) et Ledger (frais de réseau), exclus pour DEGIRO
(colonne « Montant EUR », avant frais). La performance DEGIRO est donc
légèrement flattée par rapport aux autres comptes ; l'harmonisation est notée
dans `docs/TODO.md`.

## Limites connues

- Les dividendes ne sont pas suivis : les relevés de transactions ne les contiennent pas.
- **Seuls les achats sont gérés.** Une vente est détectée et signalée à l'import,
  mais ignorée : la traiter demanderait de suivre les lots (FIFO/PRU) dans
  `buildPositions`.
- Yahoo Finance est une API non officielle, sans garantie de disponibilité.
- Les données sont stockées dans le `localStorage` du navigateur : elles sont
  propres à ce navigateur et disparaissent si l'on efface les données du site.
  Conserver les CSV d'origine permet de tout ré-importer.
- Les animations Recharts sont désactivées : la version 2.15 ne rend pas les formes
  sous React 19 quand elles sont actives.

## Licence

Copyright © 2026 EdouardLexx — distribué sous licence
[GNU AGPL v3.0 ou ultérieure](LICENSE).

En clair : chacun peut utiliser, étudier, modifier et redistribuer ce logiciel,
y compris ses versions modifiées, à condition qu'elles restent sous la même
licence, avec leur code source publié et la mention de l'auteur d'origine. Cela
vaut aussi pour une version proposée comme service en ligne. Le texte de
[LICENSE](LICENSE) fait seul foi.

L'application inclut des composants tiers (React, Express, pdf.js, Bun…),
chacun sous sa propre licence : leurs mentions sont regroupées dans
`THIRD_PARTY_LICENSES.txt`, généré à chaque build, joint à chaque release et
accessible depuis le bas de page de l'application.

Les données de marché viennent de Yahoo Finance et restent soumises à ses propres
conditions ; la licence ne couvre que le code de ce dépôt.

