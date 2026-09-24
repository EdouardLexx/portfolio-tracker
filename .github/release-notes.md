## Télécharger et lancer

Aucune installation : téléchargez le fichier de votre système, lancez-le, et
l'application s'ouvre dans votre navigateur.

| Système | Fichier |
|---|---|
| Windows | `portfolio-tracker-windows-x64.exe` |
| Mac Apple Silicon (M1 et suivants) | `portfolio-tracker-macos-arm64.zip` |
| Mac Intel | `portfolio-tracker-macos-x64.zip` |
| Linux | `portfolio-tracker-linux-x64.tar.gz` |

**Windows** — double-cliquez sur le `.exe`. Windows affiche « Windows a protégé
votre ordinateur » : cliquez sur *Informations complémentaires*, puis *Exécuter
quand même*. L'application n'est pas signée, d'où cet avertissement.

**macOS** — ouvrez le `.zip`, puis double-cliquez sur le fichier extrait. macOS
le bloque la première fois : ouvrez *Réglages Système → Confidentialité et
sécurité*, puis cliquez sur *Ouvrir quand même* en bas de la page.

**Linux** — décompressez l'archive, puis lancez `./portfolio-tracker-linux-x64`
dans un terminal.

Une fenêtre de terminal reste ouverte pendant l'utilisation : **fermez-la pour
arrêter l'application**. Relancer le fichier alors qu'elle tourne déjà rouvre
simplement l'onglet.

## Vos données

Tout reste sur votre ordinateur, dans votre navigateur. Seuls les codes des
titres (ISIN, symboles) sont envoyés à Yahoo Finance pour obtenir les cours.
Vider les données de navigation efface le portefeuille.

## Limites à connaître

- Les **ventes ne sont pas prises en compte** : si vous avez déjà vendu des
  titres, les chiffres affichés seront faux.
- Les cours viennent d'une API Yahoo Finance non officielle, qui peut être
  indisponible par moments.
- Cet outil ne constitue pas un conseil en investissement.

Le code source est public et ces exécutables sont fabriqués automatiquement par
GitHub Actions à partir de ce dépôt.
Logiciel libre sous licence GNU AGPL v3.0 ou ultérieure.
