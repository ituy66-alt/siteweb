# Flux Store

Site de téléchargement avec auth Discord, panel admin et bot Discord.

## Structure

```
/
├── public/          → Frontend (HTML, CSS, JS)
├── server/          → Backend Express
│   ├── index.js     → Serveur principal
│   ├── .env         → Config (à remplir)
│   └── data/        → Base de données JSON
└── bot discord/     → Bot Discord.js
```

## 1. Config Discord Developer Portal

1. Va sur https://discord.com/developers/applications
2. Crée une application (ou utilise l'existante)
3. Dans **OAuth2** :
   - Copie le **Client ID** et **Client Secret**
   - Ajoute le Redirect URI : `http://localhost:3000/auth/discord/callback`
4. Dans **Bot** : copie le **Token**

## 2. Remplir server/.env

```env
DISCORD_CLIENT_ID=ton_client_id
DISCORD_CLIENT_SECRET=ton_client_secret
DISCORD_REDIRECT_URI=http://localhost:3000/auth/discord/callback
DISCORD_BOT_TOKEN=ton_bot_token
SESSION_SECRET=un_secret_random_long
PORT=3000
BASE_URL=http://localhost:3000
```

## 3. Lancer le serveur

```bash
cd server
node index.js
```

Ouvre http://localhost:3000

## 4. Lancer le bot Discord

```bash
cd "bot discord"
node index.js
```

## 5. Donner les droits Owner

Dans Discord, utilise la commande slash :
```
/giveowner id:TON_ID_DISCORD
```

> Si aucun owner n'existe encore, n'importe qui peut utiliser /giveowner la première fois.

Une fois owner, à la prochaine connexion sur le site tu verras le bouton **Admin** en bas à gauche.

## Fonctionnalités

- **Auth Discord OAuth2** — connexion via Discord
- **Panel Admin** — ajouter des produits (nom, prix, image URL ou fichier, lien DL, description)
- **Services** — grille de produits avec modal de détail style Sellpass
- **Buy** — achat avec email, livraison instantanée
- **Library** — tous tes achats avec bouton télécharger
- **Panier** — icône en haut avec badge rouge pour les nouveaux achats
- **Bot Discord** — `/giveowner`, `/removeowner`, `/listowners`, `/zelda`, `/multiplayer`
- **Particules animées** — fond noir avec lignes blanches qui bougent
