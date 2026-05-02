require('dotenv').config({ path: require('path').join(__dirname, '../server/.env') });
const { Client, GatewayIntentBits, REST, Routes, SlashCommandBuilder } = require("discord.js");
const fs   = require('fs');
const path = require('path');
const http = require('http');
const https = require('https');

const TOKEN          = process.env.DISCORD_BOT_TOKEN;
const CLIENT_ID      = process.env.DISCORD_CLIENT_ID      || "1499806193055436851";
const GUILD_ID       = process.env.DISCORD_GUILD_ID;          // ← OBLIGATOIRE pour commandes instantanées
const SITE_URL       = process.env.BASE_URL               || "http://localhost:3000";
const INTERNAL_SECRET = process.env.INTERNAL_SECRET       || "flux_internal_secret";

if (!TOKEN) { console.error("❌ DISCORD_BOT_TOKEN manquant dans .env"); process.exit(1); }
if (!GUILD_ID) { console.error("❌ DISCORD_GUILD_ID manquant dans .env — ajoute l'ID de ton serveur Discord"); process.exit(1); }

// ── DATA HELPERS ──
const DATA = path.join(__dirname, '../server/data');

function readJSON(file) {
  const p = path.join(DATA, file);
  if (!fs.existsSync(p)) return [];
  try { return JSON.parse(fs.readFileSync(p, 'utf8')); } catch { return []; }
}
function writeJSON(file, data) {
  fs.writeFileSync(path.join(DATA, file), JSON.stringify(data, null, 2));
}

function readOwners()       { return readJSON('owners.json'); }
function writeOwners(d)     { writeJSON('owners.json', d); }
function isOwner(id)        { return readOwners().includes(id); }

function readBans()         { return readJSON('bans.json'); }
function writeBans(d)       { writeJSON('bans.json', d); }

// ── HTTP HELPER (appel interne vers le serveur web) ──
function httpPost(urlStr, body) {
  return new Promise((resolve, reject) => {
    const payload = JSON.stringify(body);
    const url = new URL(urlStr);
    const lib = url.protocol === 'https:' ? https : http;
    const req = lib.request({
      hostname: url.hostname,
      port: url.port || (url.protocol === 'https:' ? 443 : 80),
      path: url.pathname,
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload) }
    }, res => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => { try { resolve(JSON.parse(data)); } catch { reject(new Error('Réponse invalide')); } });
    });
    req.on('error', reject);
    req.write(payload);
    req.end();
  });
}

// ── COMMANDES ──
const commands = [
  new SlashCommandBuilder()
    .setName("verifysite")
    .setDescription("Obtiens un code pour te connecter sur le site Flux"),

  new SlashCommandBuilder()
    .setName("giveowner")
    .setDescription("Donne les droits owner à un utilisateur (owner seulement)")
    .addStringOption(o => o.setName("id").setDescription("ID Discord de l'utilisateur").setRequired(true)),

  new SlashCommandBuilder()
    .setName("removeowner")
    .setDescription("Retire les droits owner à un utilisateur (owner seulement)")
    .addStringOption(o => o.setName("id").setDescription("ID Discord de l'utilisateur").setRequired(true)),

  new SlashCommandBuilder()
    .setName("listowners")
    .setDescription("Liste tous les owners actuels (owner seulement)"),

  new SlashCommandBuilder()
    .setName("banip")
    .setDescription("Bannit une IP du site (owner seulement)")
    .addStringOption(o => o.setName("ip").setDescription("Adresse IP à bannir").setRequired(true))
    .addStringOption(o => o.setName("raison").setDescription("Raison du ban").setRequired(false)),

  new SlashCommandBuilder()
    .setName("unbanip")
    .setDescription("Débannit une IP du site (owner seulement)")
    .addStringOption(o => o.setName("ip").setDescription("Adresse IP à débannir").setRequired(true)),

  new SlashCommandBuilder()
    .setName("listbans")
    .setDescription("Liste toutes les IP bannies (owner seulement)"),

  new SlashCommandBuilder()
    .setName("zelda")
    .setDescription("Envoie les liens Zelda en MP"),

  new SlashCommandBuilder()
    .setName("multiplayer")
    .setDescription("Envoie les liens Multiplayer en MP"),

].map(c => c.toJSON());

// ── ENREGISTREMENT GUILD (instantané) ──
const rest = new REST({ version: "10" }).setToken(TOKEN);

(async () => {
  try {
    console.log("⏳ Enregistrement des commandes sur le serveur...");
    await rest.put(
      Routes.applicationGuildCommands(CLIENT_ID, GUILD_ID),
      { body: commands }
    );
    console.log(`✅ ${commands.length} commandes enregistrées instantanément sur le serveur ${GUILD_ID}`);
  } catch (err) {
    console.error("❌ Erreur enregistrement:", err.message);
  }
})();

// ── CLIENT ──
const client = new Client({ intents: [GatewayIntentBits.Guilds] });

client.on("ready", () => {
  console.log(`✅ Bot connecté : ${client.user.tag}`);
});

client.on("interactionCreate", async (interaction) => {
  if (!interaction.isChatInputCommand()) return;
  const cmd = interaction.commandName;

  // ── /verifysite ──
  if (cmd === "verifysite") {
    await interaction.deferReply({ ephemeral: true });
    try {
      const result = await httpPost(`${SITE_URL}/internal/create-verify-code`, {
        secret: INTERNAL_SECRET,
        userId: interaction.user.id,
        username: interaction.user.username,
        avatar: interaction.user.avatar || null
      });

      if (!result.success) throw new Error(result.error || 'Erreur serveur');

      await interaction.editReply({
        content: [
          `## 🔑 Code de connexion Flux`,
          ``,
          `\`\`\``,
          result.code,
          `\`\`\``,
          ``,
          `**Comment l'utiliser :**`,
          `1. Va sur **${SITE_URL}**`,
          `2. Clique sur **"Se connecter"**`,
          `3. Entre ce code dans les 6 cases`,
          `4. La page se rafraîchit automatiquement`,
          ``,
          `⏱️ Expire dans **10 minutes** — usage unique.`,
          `🔒 Ne le partage à personne.`
        ].join('\n')
      });
    } catch (err) {
      console.error("verifysite:", err.message);
      await interaction.editReply({ content: `❌ Impossible de contacter le serveur.\nVérifie que le site est lancé sur \`${SITE_URL}\`` });
    }
  }

  // ── /giveowner ──
  if (cmd === "giveowner") {
    const owners = readOwners();
    if (owners.length > 0 && !isOwner(interaction.user.id))
      return interaction.reply({ content: "❌ Tu n'as pas les droits.", ephemeral: true });

    const targetId = interaction.options.getString("id");
    if (owners.includes(targetId))
      return interaction.reply({ content: `⚠️ \`${targetId}\` est déjà owner.`, ephemeral: true });

    owners.push(targetId);
    writeOwners(owners);
    await interaction.reply({ content: `✅ \`${targetId}\` est maintenant **owner** sur Flux.`, ephemeral: true });
  }

  // ── /removeowner ──
  if (cmd === "removeowner") {
    if (!isOwner(interaction.user.id))
      return interaction.reply({ content: "❌ Accès refusé.", ephemeral: true });

    const targetId = interaction.options.getString("id");
    const owners = readOwners();
    if (!owners.includes(targetId))
      return interaction.reply({ content: `⚠️ \`${targetId}\` n'est pas owner.`, ephemeral: true });

    writeOwners(owners.filter(id => id !== targetId));
    await interaction.reply({ content: `✅ Droits owner de \`${targetId}\` retirés.`, ephemeral: true });
  }

  // ── /listowners ──
  if (cmd === "listowners") {
    if (!isOwner(interaction.user.id))
      return interaction.reply({ content: "❌ Accès refusé.", ephemeral: true });

    const owners = readOwners();
    if (owners.length === 0)
      return interaction.reply({ content: "Aucun owner configuré.", ephemeral: true });

    await interaction.reply({
      content: `**Owners (${owners.length}) :**\n${owners.map(id => `• \`${id}\``).join('\n')}`,
      ephemeral: true
    });
  }

  // ── /banip ──
  if (cmd === "banip") {
    if (!isOwner(interaction.user.id))
      return interaction.reply({ content: "❌ Accès refusé.", ephemeral: true });

    const ip     = interaction.options.getString("ip");
    const raison = interaction.options.getString("raison") || "Aucune raison spécifiée";
    const bans   = readBans();

    if (bans.find(b => b.ip === ip))
      return interaction.reply({ content: `⚠️ \`${ip}\` est déjà banni.`, ephemeral: true });

    bans.push({ ip, raison, username: "via Discord", bannedAt: new Date().toISOString(), bannedBy: interaction.user.username });
    writeBans(bans);
    await interaction.reply({ content: `🔨 IP \`${ip}\` bannie.\nRaison : ${raison}`, ephemeral: true });
  }

  // ── /unbanip ──
  if (cmd === "unbanip") {
    if (!isOwner(interaction.user.id))
      return interaction.reply({ content: "❌ Accès refusé.", ephemeral: true });

    const ip   = interaction.options.getString("ip");
    const bans = readBans();
    if (!bans.find(b => b.ip === ip))
      return interaction.reply({ content: `⚠️ \`${ip}\` n'est pas dans la liste des bans.`, ephemeral: true });

    writeBans(bans.filter(b => b.ip !== ip));
    await interaction.reply({ content: `✅ IP \`${ip}\` débannie.`, ephemeral: true });
  }

  // ── /listbans ──
  if (cmd === "listbans") {
    if (!isOwner(interaction.user.id))
      return interaction.reply({ content: "❌ Accès refusé.", ephemeral: true });

    const bans = readBans();
    if (bans.length === 0)
      return interaction.reply({ content: "Aucune IP bannie.", ephemeral: true });

    const lines = bans.map(b => `• \`${b.ip}\` — ${b.username} — ${b.raison}`).join('\n');
    await interaction.reply({ content: `**IPs bannies (${bans.length}) :**\n${lines}`, ephemeral: true });
  }

  // ── /zelda ──
  if (cmd === "zelda") {
    try {
      await interaction.user.send(`Voici les liens Zelda :\n\nCemu : https://cemu.info/releases/cemu_1.26.0.zip\nWiiU Downloader : https://github.com/Xpl0itU/WiiUDownloader/releases/download/v2.92/WiiUDownloader-Windows.zip`);
      await interaction.reply({ content: "Je t'ai envoyé ça en MP 👍", ephemeral: true });
    } catch {
      await interaction.reply({ content: "Impossible de t'envoyer un MP (DM fermés).", ephemeral: true });
    }
  }

  // ── /multiplayer ──
  if (cmd === "multiplayer") {
    try {
      await interaction.user.send(`Pour Zelda :\n\nWii U Downloader : https://github.com/Xpl0itU/WiiUDownloader/releases\nCemu : https://cemu.info/changelog.html\n\nMultiplayer :\n\nPython 3.8 : https://www.python.org/downloads/release/python-3810/\nDotnet : https://dotnet.microsoft.com/en-us/download/dotnet/thank-you/runtime-desktop-6.0.14-windows-x64-installer\nMicrosoft Visual C++ : https://learn.microsoft.com/en-us/cpp/windows/latest-supported-vc-redist?view=msvc-170\nMilkbar : https://github.com/MilkBarModding/MilkBarLauncher/releases/tag/2.0.1\nRadmin VPN : https://www.radmin-vpn.com/fr/`);
      await interaction.reply({ content: "Je t'ai envoyé les infos en MP 👍", ephemeral: true });
    } catch {
      await interaction.reply({ content: "Impossible d'envoyer le MP.", ephemeral: true });
    }
  }
});

client.login(TOKEN);
