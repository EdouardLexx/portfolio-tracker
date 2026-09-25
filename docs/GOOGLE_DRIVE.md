# Synchronisation Google Drive : configuration

La synchronisation n'apparaît dans l'application qu'une fois un identifiant de
client OAuth Google inscrit dans `GOOGLE_CLIENT_ID`
(`src/api/googleDrive.ts`). Cet identifiant est **public par nature** : une
application qui tourne dans le navigateur ne peut pas garder de secret, et
Google le sait. Il n'y a **pas** de « code secret du client » à créer ni à
copier.

Une version modifiée (fork) doit utiliser son propre projet Google Cloud.

## 1. Créer le projet

1. Ouvrir <https://console.cloud.google.com/>, avec le compte Google qui
   portera l'application.
2. Sélecteur de projet (en haut) → **Nouveau projet**, nom `Portefeuille` →
   **Créer**, puis le sélectionner.

## 2. Activer l'API Google Drive

**API et services** → **Bibliothèque** → chercher **Google Drive API** →
**Activer**.

## 3. Écran de consentement (Google Auth Platform)

1. **API et services** → **Écran de consentement OAuth** → **Commencer**.
2. **Informations sur l'application** : nom `Portefeuille`, adresse e-mail
   d'assistance (elle sera visible des utilisateurs : une adresse dédiée est
   possible).
3. **Audience** : **Externe**.
4. **Coordonnées** : une adresse e-mail de contact → **Créer**.
5. **Accès aux données** → **Ajouter ou supprimer des champs d'application** →
   cocher `.../auth/drive.appdata` (« Afficher, créer et supprimer ses propres
   données de configuration dans votre Google Drive ») → **Mettre à jour** →
   **Enregistrer**.
6. **Audience** → **Utilisateurs tests** → **Ajouter des utilisateurs** : son
   propre compte Google. Tant que l'application reste « En test », seuls ces
   comptes (100 au plus) peuvent se connecter, avec un avertissement « Google
   n'a pas validé cette application » à passer par **Continuer**.

## 4. Créer l'identifiant

**Clients** → **Créer un client** → type **Application Web**, nom
`Portefeuille web`.

**Origines JavaScript autorisées** :

```
http://127.0.0.1:4719
http://localhost:5173
http://127.0.0.1:5173
```

**URI de redirection autorisés** :

```
http://127.0.0.1:4719/oauth.html
http://localhost:5173/oauth.html
http://127.0.0.1:5173/oauth.html
```

Le premier couple sert à l'exécutable et à `npm start`, les deux suivants à
`npm run dev`. L'interface en ligne (étape 3) ajoutera son adresse GitHub Pages.

**Créer** → copier l'**ID client** (il se termine par
`.apps.googleusercontent.com`) et l'inscrire dans `GOOGLE_CLIENT_ID`.

## 5. Ouvrir à d'autres utilisateurs

Pour que n'importe qui puisse se connecter : **Audience** → **Publier
l'application**. `drive.appdata` n'est pas un champ d'application « sensible »
au sens de Google, ce qui évite la procédure d'audit ; Google peut toutefois
demander de valider la marque (nom, logo, page d'accueil, règles de
confidentialité) avant de retirer l'avertissement.

## Dépannage

| Message de Google | Cause |
|---|---|
| `redirect_uri_mismatch` | l'adresse de la page n'est pas dans les URI de redirection (vérifier le port et `http` / `https`) |
| `access_denied` | refus sur l'écran de consentement, ou compte absent des utilisateurs tests |
| `invalid_client` | `GOOGLE_CLIENT_ID` mal copié |
| Fenêtre bloquée | autoriser les fenêtres pop-up pour l'adresse de l'application |
