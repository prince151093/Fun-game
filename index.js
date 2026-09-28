require('dotenv').config();
const {Client,GatewayIntentBits,Collection,Events}=require('discord.js');
const fs=require('fs'); const handlers=require('./handlers');
const client=new Client({intents:[GatewayIntentBits.Guilds,GatewayIntentBits.GuildMembers,GatewayIntentBits.GuildMessages,GatewayIntentBits.MessageContent]});
client.commands=new Collection();
for(const file of fs.readdirSync('./commands').filter(f=>f.endsWith('.js'))){const c=require(`./commands/${file}`);client.commands.set(c.data.name,c);}
client.once(Events.ClientReady,c=>console.log(`VR GAMERzzz Ticket Bot online as ${c.user.tag}`));
client.on(Events.InteractionCreate,async i=>{try{if(i.isChatInputCommand()){const c=client.commands.get(i.commandName);if(c)await c.execute(i);return;}if(i.isButton()){if(i.customId.startsWith('ticket:close:'))return handlers.close(i);if(i.customId.startsWith('ticket:'))return handlers.button(i);if(i.customId.startsWith('application:decision:'))return handlers.decision(i);if(i.customId.startsWith('application:'))return handlers.applicationAction(i);}if(i.isModalSubmit()&&i.customId==='application_modal')return handlers.application(i);}catch(e){console.error(e);if(i.replied||i.deferred)await i.followUp({content:'Something went wrong. Please try again.',ephemeral:true}).catch(()=>{});else await i.reply({content:'Something went wrong. Please try again.',ephemeral:true}).catch(()=>{});}});
client.login(process.env.DISCORD_TOKEN);
