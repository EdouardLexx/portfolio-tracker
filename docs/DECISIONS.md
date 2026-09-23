# Decisions

Décisions structurantes, celles dont l'ignorance ferait casser quelque chose.
Chacune est vérifiable dans le code cité. Les points non tranchés dans le code
sont marqués **à confirmer**.

## Modèle de transaction unique pour toutes les sources

### Decision
Toute source se normalise en `Transaction` (`src/types/index.ts`). Les pages,
calculs et graphes ne connaissent que ce type ; les spécificités d'un courtier
s'arrêtent à son parseur dans `src/parsers/`.

### Reason
Six comptes, quatre formats de fichiers et deux saisies manuelles. Sans forme
commune, chaque écran aurait dû connaître chaque format.

### Alternatives
Un modèle par source avec conversion à l'affichage : rejeté, la logique de
conversion se serait dupliquée dans chaque graphe.

### Consequence
Ajouter une source revient à écrire un parseur et à le brancher dans
`importFiles`. L'interface s'adapte seule. En contrepartie, le modèle doit
accueillir des cas hétérogènes, d'où les champs optionnels `symbol` et
`interestEUR`.

## Déduplication par nombre d'occurrences, pas par présence

### Decision
`mergeTransactions` (`src/parsers/shared.ts`) groupe par `id` et conserve
`max(occurrences existantes, occurrences du fichier)`.

### Reason
Un courtier éclate un ordre en plusieurs lignes d'exécution **strictement
identiques** — par exemple quatre lignes d'un même ordre, avec mêmes date,
heure, quantité, cours et montant. Dédupliquer sur le contenu les
aurait fusionnées en une seule et fait disparaître trois achats réels.

### Alternatives
Clé sur la seule référence d'ordre : insuffisante, les fills la partagent.
Hachage de la ligne entière : écrase les jumeaux légitimes.

### Consequence
Ré-importer un export complet n'ajoute rien ; un export partiel n'ajoute que le
surplus. Corollaire important : **plusieurs transactions partagent un `id`**,
donc toute suppression doit viser une position, pas un identifiant.

## Suppression de lignes par position, jamais par identifiant

### Decision
`removeTransactionsAt(indices)` (`src/hooks/usePortfolio.ts`) supprime par index
dans `allTransactions`. `removeTransaction(id)` ne retire que la **première**
occurrence.

### Reason
Conséquence directe de la décision précédente : un `filter(t => t.id !== id)`
aurait effacé les quatre lignes jumelles d'un coup.

### Consequence
La page Données transporte l'index de chaque ligne avec la ligne elle-même. Une
suppression accidentelle se rattrape en réimportant le fichier d'origine,
puisque la fusion rétablit le compte d'occurrences manquant.

## Agrégation par symbole puis ISIN, jamais par nom

### Decision
Clé de position : `tx.symbol || tx.isin || tx.productName`
(`buildPositions`, `src/utils/calculations.ts`).

### Reason
Un ETF peut changer de nom sans changer d'ISIN : c'est arrivé à toute la gamme
Lyxor après son rachat par Amundi, dont les fonds sont passés d'un préfixe
« LYX » à « AMUN ». Des relevés d'années différentes portent alors deux noms pour
le même titre ; regrouper par nom aurait créé deux positions pour une seule
ligne réelle.

### Consequence
Le repli sur `productName` ne sert qu'aux lignes sans ISIN ni symbole.
`summarisePerAccount` utilise encore une clé différente — voir
`docs/PROJECT_STATUS.md`, issue 2.

## TWR pour la performance, distinct de la plus-value

### Decision
Le graphe Performance affiche un rendement pondéré par le temps
(`src/utils/performance.ts`), pas le rapport valeur/coût affiché sur les tuiles.

### Reason
Un indice ne reçoit pas de virements. Sans neutraliser les apports, la courbe
monterait à chaque versement et la comparaison au S&P 500 n'aurait aucun sens.

### Alternatives
Rapport valeur/versements : simple mais incomparable à un indice. TRI : déjà
utilisé pour la projection, mais impropre à une courbe quotidienne.

### Consequence
Deux chiffres différents coexistent volontairement dans l'interface (par exemple
un TWR nettement supérieur à la plus-value latente). L'écart est réel : le TWR
pèse chaque période à égalité, la plus-value pèse en euros, donc un gain réalisé
quand peu d'argent était investi compte beaucoup dans l'un et peu dans l'autre.
Ne pas « corriger » l'un vers l'autre.

## Report des flux et des indices dans le calcul TWR

### Decision
Un jour non valorisable conserve ses flux dans `pendingCashFlow`, appliqués au
premier jour valorisable suivant. Les indices sont lus par `carryForward`.

### Reason
Bug corrigé et mesuré : sur un titre à prix strictement constant avec un achat un
jour férié américain, le calcul précédent annonçait **+100 %** au lieu de 0 %.
Le versement était compté comme une performance, et les journées européennes
ouvertes alors que Wall Street était fermé disparaissaient de la série.

### Consequence
Le PEA gagne environ deux points de TWR par rapport au calcul précédent, et le
nombre de points de la série augmente sensiblement. `computePerformance` renvoie
des `diagnostics` pour détecter un retour du problème.

## Conversion au taux de change du jour, pas au taux courant

### Decision
Les séries historiques convertissent chaque journée au taux de `EUR<DEVISE>=X`
de cette journée (`performance.ts`, `WealthChart.tsx`, `ledgerCsv.ts`).

### Reason
Les apports sont des montants en euros réels et datés. Les valoriser au taux du
jour ferait apparaître une performance de change qui n'a jamais existé.

### Consequence
Une requête d'historique supplémentaire par devise étrangère.

## Calculs financiers hors composants React

### Decision
`calculations.ts`, `performance.ts` et `projection.ts` sont des fonctions pures ;
les composants ne font qu'appeler et afficher.

### Reason
Le calcul TWR était initialement enfermé dans un `useMemo`, donc invérifiable
autrement qu'à l'œil. L'extraction a permis de le confronter à des cas dont la
réponse est connue, et c'est ainsi que le bug de report a été prouvé.

### Consequence
Ces modules sont prêts à être testés ; **aucun test n'existe encore**.

## Intérêts séparés du prix de revient

### Decision
Les intérêts bancaires sont portés par `interestEUR`, distinct de `amountEUR`.
Les lignes d'intérêts ont `quantity: 0` et `amountEUR: 0`
(`boursoramaAccountCsv.ts`).

### Reason
Un intérêt augmente le solde sans être un versement. Le compter dans le coût
ferait disparaître le gain.

### Consequence
Solde Livret A = versements nets + intérêts. Les lignes d'intérêts sont inertes
pour les positions et pour les apports de la projection.

## Les opérations font foi, pas la colonne « Solde » du relevé

### Decision
Le solde du Livret A est recalculé depuis les opérations ; l'écart avec la
colonne « Solde » du fichier est signalé à l'import
(`boursoramaAccountCsv.ts`).

### Reason
Sur un export réel, une part significative des lignes ne suit pas le cumul, en
particulier quand plusieurs opérations partagent une date, et l'écart final est
bien trop grand pour s'expliquer par un arrondi.

### Alternatives
Faire confiance à la colonne : rejeté, elle est démontrablement incohérente.
Trancher en silence : rejeté, l'utilisateur doit pouvoir vérifier.

### Consequence
Un avertissement apparaît à chaque import de ce relevé tant que l'écart persiste.

## Or valorisé au poids d'or fin

### Decision
Une pièce vaut son contenu en or pur, calculé depuis `GC=F` (USD l'once)
converti en euros (`goldManual.ts`, `COIN_SPECS`). Une pièce de 20 francs de
l'Union latine pèse 6,45161 g à 900/1000, soit 5,80645 g d'or fin.

### Reason
Aucune cotation n'existe pour une pièce ; le métal en a une.

### Consequence
La prime numismatique n'est pas suivie : une pièce achetée chez un numismate a
coûté davantage que son poids d'or. Le formulaire permet donc de saisir le
montant réellement payé, faute de quoi le coût est sous-estimé et la performance
surévaluée.

## Persistance en localStorage, sans base ni compte

### Decision
Tout vit dans le `localStorage` du navigateur, sous des clés versionnées
(`src/utils/store.ts`). Aucune authentification.

### Reason
Application locale et mono-utilisateur. Une base de données aurait imposé un
serveur d'état, des sauvegardes et une authentification pour un seul usager.

### Consequence
Les données ne suivent ni d'un navigateur à l'autre, ni d'un appareil à l'autre,
et disparaissent si l'on efface les données du site. Aucun export n'existe pour
compenser. C'est la contrainte la plus lourde du projet aujourd'hui.

## Animations Recharts désactivées

### Decision
`isAnimationActive={false}` sur tous les graphes.

### Reason
Recharts 2.15 avec React 19 ne rend pas les formes (secteurs, barres, courbes)
quand les animations sont actives : les éléments SVG restent vides.

### Alternatives
Recharts 3.x : testé, les formes ne se rendaient pas non plus. Retour à la 2.15
avec animations coupées.

### Consequence
Ne pas réactiver sans vérifier chaque graphe après une montée de version.

## Seules les entrées sont traitées

### Decision
Ventes, retraits et opérations non confirmées sont détectés, signalés à l'import,
puis ignorés (`degiroCsv.ts`, `boursoramaPdf.ts`, `ledgerCsv.ts`).

### Reason
Traiter une vente impose de suivre les lots (FIFO ou prix moyen pondéré) et de
distinguer plus-value réalisée et latente. Les ventes n'étaient pas
nécessaires au périmètre initial.

### Consequence
Les chiffres deviendront faux dès la première vente. C'est la limite
fonctionnelle la plus importante à connaître.

## Taux du Livret A indicatif, non utilisé dans les calculs

### Decision
Le taux est récupéré auprès de la Caisse des Dépôts et affiché, mais aucun
intérêt n'en est déduit.

### Reason
Le taux change en cours d'année et se capitalise par quinzaines. Le solde issu du
relevé est plus juste que n'importe quelle projection.

### Consequence
Si aucun relevé n'est importé, les intérêts ne sont connus que par la saisie
manuelle du solde.

## Répartition des frais dans le prix de revient — **à confirmer**

### Decision
Aucune convention n'a été arrêtée. Le code inclut les frais pour le PEA et
Ledger, les exclut pour DEGIRO.

### Reason
Chaque parseur a suivi la colonne la plus naturelle de son format ; la
divergence semble non intentionnelle plutôt que décidée.

### Consequence
Comparaisons entre comptes légèrement biaisées. À trancher avant tout travail
sur la performance par compte — voir `docs/TODO.md`.

## Serveur limité à la boucle locale, sans CORS

### Decision
`server.js` écoute sur `127.0.0.1` uniquement et ne pose aucun en-tête CORS ;
les listes passées en paramètre sont plafonnées et le cache est borné.

### Reason
L'API est un proxy Yahoo sans authentification. Sur un réseau partagé, écouter
sur toutes les interfaces laissait n'importe quelle machine s'en servir, et un
`cors()` ouvert laissait n'importe quel site visité l'appeler depuis le
navigateur. Le front n'en a pas besoin : Vite proxifie `/api`, les requêtes sont
donc de même origine.

### Alternatives
Garder l'écoute globale pour un accès à distance : rejeté, un accès distant doit
passer par le front (Vite), qui relaie lui-même vers `127.0.0.1`.

### Consequence
Appeler l'API depuis une autre machine ou une autre origine ne fonctionne plus,
volontairement. Le proxy Vite cible `127.0.0.1` et non `localhost`, qui peut se
résoudre en IPv6.
