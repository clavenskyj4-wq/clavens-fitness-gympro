<div align="center">
<img width="1200" height="475" alt="GHBanner" src="https://ai.google.dev/static/site-assets/images/share-ais-513315318.png" />
</div>

# Run and deploy your AI Studio app

This contains everything you need to run your app locally.

View your app in AI Studio: https://ai.studio/apps/a3ce8f28-7890-43e8-aa0f-a0f4d0f8fd02

## Run Locally

**Prerequisites:**  Node.js


1. Install dependencies:
   `npm install`
2. Set the `GEMINI_API_KEY` in [.env.local](.env.local) to your Gemini API key
3. Run the app:
   `npm run dev`

## Accès Super Admin et approbation des inscriptions

L’espace Super Admin est accessible depuis l’application après connexion avec le compte
administrateur GymPro. Son accès aux demandes est protégé par des identifiants côté serveur;
il n’est pas inclus dans le lien/QR public d’inscription.

Avant le déploiement, définissez dans l’environnement du serveur :

- `GYMPRO_SUPER_ADMIN_USER` : identifiant privé (ex. `superadmin`)
- `GYMPRO_SUPER_ADMIN_PASSWORD` : mot de passe unique et robuste
- `GYMPRO_SUPER_ADMIN_SESSION_SECRET` : clé aléatoire longue utilisée pour signer les sessions

Sur Render : **Dashboard → votre service → Environment → Add Environment Variable**. Définissez
ces trois variables, puis redéployez. Ne publiez pas ces valeurs dans GitHub. Le modèle se trouve
dans [.env.example](./.env.example).

Les demandes reçues par QR restent en attente jusqu’à leur approbation. Après approbation, elles
sont importées dans **Membres** pour terminer l’inscription et choisir un forfait. Le relais utilise
le fichier `.gympro-relay-state.json`. Sur Render, montez un disque persistant sur `/var/data` et
définissez `GYMPRO_RELAY_STATE_FILE=/var/data/.gympro-relay-state.json` pour conserver les demandes
lors des redémarrages et redéploiements.
