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
Le serveur (`server.js`, `server/standalone.js`) écoute sur `127.0.0.1` uniquement et ne pose aucun en-tête CORS ;
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

## Mode discret : masquer la taille, pas la performance

### Decision
Le mode discret masque les montants en euros et les quantités détenues ; il
laisse visibles les pourcentages et les prix unitaires. Il est implémenté comme
un drapeau dans `formatters.ts`, basculé par `useDiscreet`.

### Reason
Ce qui est sensible, c'est **combien** on possède. Un pourcentage ou un cours
de marché ne le révèle pas ; une quantité, si, puisque quantité × cours donne le
montant. Tous les montants passant déjà par `formatters.ts`, un drapeau à cet
endroit couvre chaque page et chaque graphe sans toucher aux composants.

### Alternatives
Un contexte React : plus idiomatique, mais aurait imposé de modifier la
soixantaine d'appels à `formatEUR`. Un flou CSS : il aurait fallu marquer chaque
montant à la main, et le texte serait resté lisible dans le DOM.

### Consequence
Tout nouveau montant doit passer par un formateur qui respecte le drapeau, sinon
il échappe au mode discret. Les messages d'import (écart de solde du Livret A)
sont construits dans les parseurs et restent en clair.

## Un exécutable autonome par plateforme, compilé avec Bun

### Decision
L'application se distribue en un fichier par système (Windows, macOS arm64 et
x64, Linux), fabriqué par `bun build --compile` et publié sur GitHub Releases
par la CI. Il embarque le moteur JavaScript, l'API et l'interface, et ouvre le
navigateur au lancement.

### Reason
Le public visé ne doit rien installer : ni Node, ni dépendances, ni commande.
Bun compile pour les quatre cibles depuis une seule machine Linux, et fait
tourner Express et `yahoo-finance2` sans modification (vérifié : cours,
recherche par ISIN, historiques).

### Alternatives
Node SEA : outil officiel, mais sans compilation croisée (un runner par
système) et exige un unique fichier CommonJS, alors que `yahoo-finance2` est un
module ESM. Electron : vrai installateur et fenêtre dédiée, mais plus de 100 Mo
et une maintenance plus lourde. Version hébergée : aucune installation, mais
Yahoo bloque vite les serveurs cloud, et l'utilisateur deviendrait l'exploitant
d'un service en ligne.

### Consequence
Les exécutables ne sont **pas signés** : Windows (SmartScreen) et macOS
(Gatekeeper) affichent un avertissement au premier lancement, et certains
antivirus peuvent les signaler à tort. Chaque fichier pèse 65 à 90 Mo. Le port
4719 devient permanent, puisque les données sont rangées par origine.

## Licence AGPL-3.0

### Decision
Le code est publié sous GNU AGPL v3.0 ou ultérieure, au nom d'EdouardLexx.

### Reason
Le dépôt est public et l'outil est présenté pour être installé : sans licence,
personne n'avait légalement le droit de l'utiliser ni de le modifier. L'AGPL
autorise tout cela, mais oblige toute version modifiée à rester libre, avec son
code publié et la mention de l'auteur, y compris hébergée comme service en
ligne. Pour un outil qui manipule des données financières, un code ouvert et
vérifiable est aussi un argument de confiance.

### Alternatives
MIT : diffusion maximale, mais permet une reprise fermée et commerciale.
PolyForm Noncommercial : interdit l'usage commercial, mais n'est pas une licence
open source reconnue. Aucune licence : incompatible avec une invitation à
installer l'outil.

### Consequence
Chaque dépendance doit rester compatible avec l'AGPL. La licence s'applique à
partir de ce commit ; la v1.0.0, publiée avant, n'en portait aucune. Le
titulaire étant seul auteur, il peut encore publier de futures versions sous
d'autres conditions, mais ne peut pas retirer l'AGPL des versions déjà diffusées.

Les exécutables redistribuent le code des dépendances et le moteur Bun : leurs
mentions de licence (MIT, Apache-2.0, LGPL pour JavaScriptCore) sont générées à
chaque build, embarquées dans l'application et jointes aux releases. La v1.0.0
ne les contenait pas.

## Emprunts : un modèle à part, un patrimoine net

### Decision
Un emprunt est un `Loan`, pas une `Transaction`. Son échéancier se calcule à
partir de ses conditions ; le capital restant dû, le déjà remboursé et les
échéances à venir ne se saisissent pas. Patrimoine affiche, dès qu'un emprunt
existe, un patrimoine net égal au brut moins le capital restant dû.

### Reason
Un passif n'a ni cours ni position : le forcer dans `Transaction` fausserait
positions, répartition et performance. Calculer plutôt que saisir évite les
incohérences et tient les chiffres à jour chaque mois. Le taux mensuel est le
taux nominal divisé par 12, convention des prêts à taux fixe en France ; la
date de départ est celle du déblocage des fonds, jour où la dette naît, ce qui
reste défini même avec un différé total.

### Alternatives
Saisir le capital restant dû à la main : simple, mais à mettre à jour chaque
mois et sans échéancier. Gérer les prêts immobiliers tout de suite : rejeté,
sans la valeur du bien le patrimoine net serait trompeur.

### Consequence
Les intérêts d'emprunt n'entrent pas dans le TWR, qui reste celui des
placements. Taux variable et remboursements anticipés ne sont pas gérés. Si la
banque arrondit autrement, la mensualité peut différer de quelques centimes :
l'écart n'est signalé qu'au-delà de 5 centimes.

## Un solde de Livret A saisi sans mouvement devient un solde de départ

### Decision
Quand aucun mouvement de Livret A n'existe, le solde saisi est enregistré comme
un mouvement « Solde de départ », compté comme apport. Un solde déjà saisi dans
cette situation est converti au démarrage, daté du jour de sa saisie.

### Reason
La position Livret A se construit à partir des mouvements. Un solde seul
n'apparaissait donc que sur sa propre page : ni Patrimoine ni Données ne le
voyaient, et la page le comptait entièrement comme des intérêts (solde − 0
versé). En faire un mouvement le rend visible partout, et laisse les intérêts
se mesurer à partir de ce point, puisque la part d'intérêts qu'il contient est
inconnue.

### Alternatives
Compter le solde sans l'enregistrer : les intérêts redeviendraient faux dès le
premier versement ajouté. Exiger un versement avant tout solde : plus strict,
mais contre-intuitif pour qui connaît son solde et pas l'historique.

### Consequence
Les intérêts gagnés avant le solde de départ ne sont pas mesurés. Le formulaire
« Mettre à jour le solde » n'apparaît qu'une fois un mouvement enregistré ; avant,
c'est « Solde de départ ».

## Fiche d'un titre : données éphémères hors de usePortfolio

### Decision
La fiche d'un titre charge ses cours via un hook dédié, `useInstrument`, et non
via `usePortfolio`. Deux routes serveur la servent : `/api/instrument` (cours et
chiffres du jour, sur le cache des cours existant) et `/api/chart` (courbe par
période, liste fermée de périodes, symbole au format strict).

### Reason
Ces données ne concernent pas le portefeuille : elles n'existent que le temps
d'une consultation et sont jetées à la fermeture. Les faire transiter par
l'orchestrateur l'alourdirait d'un état sans rapport avec sa mission. L'état est
indexé par requête, pour qu'une réponse lente d'une période abandonnée
n'écrase jamais la période affichée.

### Alternatives
Tout passer par `usePortfolio` : fidèle à la lettre de la règle, mais au prix
d'un état transitoire dans l'état global. Une page dédiée par titre : plus
lourde, et la fiche en surimpression garde la liste des positions à portée.

### Consequence
Le « 1 j » d'une action montre la dernière séance, même un week-end ; une
crypto, les 24 dernières heures. Les cours affichés dans la fiche sont des
données de marché publiques : le mode discret ne les masque pas.

## Aucune ressource tierce dans l'interface

### Decision
L'interface n'appelle aucun service extérieur : police système plutôt que
Google Fonts, aucun CDN, aucun script tiers. Seul le serveur local contacte
Yahoo Finance et la Caisse des Dépôts.

### Reason
Le README promet que seuls les codes des titres quittent l'ordinateur. Une
police chargée depuis Google transmettait l'adresse IP et l'heure de chaque
ouverture, et bloquait l'affichage de la bonne police hors connexion.

### Alternatives
Embarquer la police Inter dans le build (paquet `@fontsource/inter`, licence
OFL) : même rendu, sans appel tiers, mais une dépendance de plus pour un gain
purement esthétique.

### Consequence
L'apparence suit la police du système (Segoe UI, San Francisco, Roboto…).
Toute nouvelle ressource doit être servie par l'application elle-même. Seule
exception, décidée avec l'auteur : la synchronisation Google Drive, et
seulement une fois activée (voir plus bas).

## Une seule nouvelle tentative sur coupure réseau

### Decision
Le cache du serveur retente une fois, après 500 ms, un appel qui échoue sur une
erreur de connexion (`fetch failed`, `ECONNRESET`, `ETIMEDOUT`…). Un refus de
Yahoo (symbole inconnu, quota) n'est pas retenté. Le cache garde la promesse,
si bien que des requêtes simultanées partagent l'appel et sa nouvelle tentative.

### Reason
Au chargement, la page demande d'un bloc une dizaine d'historiques ; une coupure
d'une seconde les faisait tous échouer, et les graphes restaient vides jusqu'au
rechargement.

### Alternatives
Réessayer côté navigateur : chaque requête aurait retenté séparément,
multipliant les appels vers Yahoo au pire moment.

### Consequence
Une panne durable coûte 500 ms de plus avant l'erreur, qui répond 502.

## Sauvegarde par fichier, fusion qui n'efface rien

### Decision
Le portefeuille s'exporte et s'importe sous forme d'un fichier JSON versionné
(`src/utils/backup.ts`). À l'import, deux choix explicites : **fusionner**
(ajoute ce qui manque, ne modifie ni n'efface rien) ou **tout remplacer**
(l'appareil devient identique au fichier). Le fichier est validé ligne par ligne
avant tout changement.

### Reason
Chaque navigateur, et chaque adresse (`npm run dev`, exécutable), garde ses
propres données : sans export, changer d'adresse ou d'appareil repartait de
zéro, et un navigateur vidé perdait tout. C'est aussi la première brique de la
synchronisation (étape 1 du plan : fichier ; 2 : Google Drive ; 3 : interface en
ligne).

### Alternatives
Fusion « intelligente » propageant les suppressions : impossible sans historique
des suppressions, prévu seulement avec la synchronisation Drive. Copie brute du
`localStorage` : dépendante des noms de clés, sans validation ni version.

### Consequence
Une ligne supprimée sur un appareil revient si l'on fusionne une sauvegarde plus
ancienne : pour recopier un appareil à l'identique, remplacer. Les fichiers
`portefeuille-sauvegarde*.json` contiennent des données réelles : ignorés par
git et exclus de l'exécutable (`scripts/embed-dist.mjs`).

## Synchronisation par Google Drive, directement depuis le navigateur

### Decision
Le portefeuille se synchronise entre appareils par un fichier JSON (le format de
sauvegarde) rangé dans un dossier visible « Portfolio Manager » du Google Drive
de l'utilisateur (`drive.file` : l'appli n'accède qu'aux fichiers qu'elle a
créés). Dossier visible plutôt que le dossier caché des applications
(`drive.appdata`), choix de l'auteur : l'utilisateur voit où sont ses données et
peut les télécharger ; en contrepartie, il peut déplacer ou supprimer le
fichier (l'appli le retrouve s'il est déplacé, le recrée s'il est supprimé).
Le navigateur parle directement à Google, par
le flux OAuth « application côté navigateur » : une fenêtre de connexion
Google, dont la réponse revient sur `public/oauth.html` et passe à l'appli par
un `BroadcastChannel`. Aucun script Google n'est chargé. Le jeton, valable une
heure, reste en mémoire. Chaque synchro fusionne à trois voies
(`src/utils/sync.ts`) avec l'état de la dernière synchro (`syncBase`). Pas de
chiffrement du fichier : choix de l'auteur.

### Reason
Voir le même portefeuille sur PC et téléphone sans serveur ni base de données à
soi : les données restent chez l'utilisateur, dans son propre Drive. La fusion à
trois voies transmet les suppressions, ce que la fusion simple de la sauvegarde
ne peut pas faire, et combine les changements faits des deux côtés.

### Alternatives
- Bibliothèque Google Identity Services : un script tiers chargé à chaque
  ouverture, pour le même résultat.
- Flux avec jeton de rafraîchissement : exige un secret, donc un serveur.
- Serveur et base de données à soi : hébergement, comptes, sécurité des
  données financières à assumer.
- Chiffrement par mot de passe : proposé, écarté par l'auteur (le fichier est
  protégé par le compte Google et invisible hors de l'appli).

### Consequence
- L'utilisateur reclique toutes les heures environ pour se reconnecter (une
  fenêtre s'ouvre et se referme seule). Aucune connexion n'est tentée sans clic,
  car les navigateurs bloquent les fenêtres non demandées.
- Drive n'a pas d'écriture conditionnelle : la version est relue juste avant
  d'écrire, une course entre deux appareils reste possible dans cette fraction
  de seconde ; un conflit détecté relance la synchro.
- Réinitialiser un appareil efface sa base : la synchro suivante le re-remplit
  depuis Drive au lieu de supprimer la copie.
- Chaque adresse de l'appli doit être déclarée dans le client Google
  (`docs/GOOGLE_DRIVE.md`).

