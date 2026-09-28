require('dotenv').config();

const http = require('http');
const fs = require('fs');
const {
  Client,
  GatewayIntentBits,
  Collection,
  Events,
} = require('discord.js');

const handlers = require('./handlers');

// Render Web Service health-check server.
const server = http.createServer((req, res) => {
  res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8' });
  res.end('VR GAMERzzz Ticket Bot is running!');
});

const port = Number(process.env.PORT) || 3000;
server.listen(port, '0.0.0.0', () => {
  console.log(`HTTP server is ready on port ${port}`);
});

// Discord client.
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
  ],
});

client.commands = new Collection();

// Load slash command modules from ./commands.
const commandsDir = './commands';
if (!fs.existsSync(commandsDir)) {
  console.error(`Commands folder not found: ${commandsDir}`);
} else {
  for (const file of fs.readdirSync(commandsDir).filter((name) => name.endsWith('.js'))) {
    const command = require(`./commands/${file}`);
    if (command?.data?.name && typeof command.execute === 'function') {
      client.commands.set(command.data.name, command);
    } else {
      console.warn(`Skipping invalid command module: ${file}`);
    }
  }
}

client.once(Events.ClientReady, (readyClient) => {
  console.log(`VR GAMERzzz Ticket Bot online as ${readyClient.user.tag}`);
});

client.on('error', (error) => {
  console.error('DISCORD CLIENT ERROR:', error);
});

client.on('shardError', (error, shardId) => {
  console.error(`DISCORD SHARD ${shardId} ERROR:`, error);
});

client.on('shardDisconnect', (event, shardId) => {
  console.error(`DISCORD SHARD ${shardId} DISCONNECTED:`, event?.code, event?.reason);
});

client.on('shardReconnecting', (shardId) => {
  console.warn(`DISCORD SHARD ${shardId} RECONNECTING`);
});

client.on('shardReady', (shardId) => {
  console.log(`DISCORD SHARD ${shardId} READY`);
});

// Report if the gateway connection has not reached Ready after 30 seconds.
setTimeout(() => {
  if (!client.isReady()) {
    console.error('DISCORD STARTUP TIMEOUT: client is not Ready after 30 seconds.');
    console.error('Current WebSocket status:', client.ws.status);
    console.error('Check the bot token, gateway connectivity, and enabled intents.');
  }
}, 30000).unref();

client.on(Events.InteractionCreate, async (interaction) => {
  try {
    if (interaction.isChatInputCommand()) {
      const command = client.commands.get(interaction.commandName);
      if (command) await command.execute(interaction);
      return;
    }

    if (interaction.isButton()) {
      if (interaction.customId.startsWith('ticket:close:')) {
        return handlers.close(interaction);
      }
      if (interaction.customId.startsWith('ticket:')) {
        return handlers.button(interaction);
      }
      if (interaction.customId.startsWith('application:decision:')) {
        return handlers.decision(interaction);
      }
      if (interaction.customId.startsWith('application:')) {
        return handlers.applicationAction(interaction);
      }
    }

    if (interaction.isModalSubmit() && interaction.customId === 'application_modal') {
      return handlers.application(interaction);
    }
  } catch (error) {
    console.error('Interaction handling error:', error);

    const reply = {
      content: 'Something went wrong. Please try again.',
      ephemeral: true,
    };

    if (interaction.replied || interaction.deferred) {
      await interaction.followUp(reply).catch(() => {});
    } else {
      await interaction.reply(reply).catch(() => {});
    }
  }
});

// Explicit startup diagnostics. Never print the token itself.
console.log('Checking Discord configuration...');
console.log('DISCORD_TOKEN exists:', Boolean(process.env.DISCORD_TOKEN));

if (!process.env.DISCORD_TOKEN) {
  console.error('ERROR: DISCORD_TOKEN is missing from the environment.');
} else {
  console.log('Starting Discord login...');
  client.login(process.env.DISCORD_TOKEN)
    .then(() => console.log('Discord login promise resolved.'))
    .catch((error) => console.error('DISCORD LOGIN FAILED:', error));
}

process.on('unhandledRejection', (error) => {
  console.error('Unhandled promise rejection:', error);
});

process.on('uncaughtException', (error) => {
  console.error('Uncaught exception:', error);
});

function shutdown(signal) {
  console.log(`${signal} received. Shutting down...`);
  client.destroy();
  server.close(() => process.exit(0));
}

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
