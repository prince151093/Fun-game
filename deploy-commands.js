require("dotenv").config();

const { REST, Routes } = require("discord.js");
const fs = require("fs");

const commands = [];
const commandFiles = fs
  .readdirSync("./commands")
  .filter(file => file.endsWith(".js"));

for (const file of commandFiles) {
  const command = require(`./commands/${file}`);

  if (command.data) {
    commands.push(command.data.toJSON());
  }
}

const token = process.env.DISCORD_TOKEN;
const clientId = process.env.CLIENT_ID;
const guildId = process.env.GUILD_ID;

if (!token) {
  throw new Error("DISCORD_TOKEN is missing.");
}

if (!clientId) {
  throw new Error("CLIENT_ID is missing.");
}

if (!guildId) {
  throw new Error("GUILD_ID is missing.");
}

const rest = new REST({ version: "10" }).setToken(token);

(async () => {
  try {
    console.log(`Deploying ${commands.length} command(s)...`);

    await rest.put(
      Routes.applicationGuildCommands(clientId, guildId),
      {
        body: commands
      }
    );

    console.log("Commands deployed successfully.");
  } catch (error) {
    console.error("Failed to deploy commands:");
    console.error(error);
    process.exit(1);
  }
})();
