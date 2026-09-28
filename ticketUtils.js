const {PermissionFlagsBits,ChannelType}=require('discord.js');
const config=require('./config');
function safeName(name){return name.toLowerCase().replace(/[^a-z0-9-]/g,'-').replace(/-+/g,'-').slice(0,45)||'user';}
function overwrites(guild,userId,type){
 const allow=[{id:userId,allow:[PermissionFlagsBits.ViewChannel,PermissionFlagsBits.SendMessages,PermissionFlagsBits.ReadMessageHistory]}];
 const everyone={id:guild.roles.everyone.id,deny:[PermissionFlagsBits.ViewChannel]};
 if(type==='support') allow.push(...[config.roles.staff,config.roles.moderator,config.roles.admin].map(id=>({id,allow:[PermissionFlagsBits.ViewChannel,PermissionFlagsBits.SendMessages,PermissionFlagsBits.ReadMessageHistory]})));
 if(type==='report') allow.push(...[config.roles.moderator,config.roles.admin].map(id=>({id,allow:[PermissionFlagsBits.ViewChannel,PermissionFlagsBits.SendMessages,PermissionFlagsBits.ReadMessageHistory]})));
 if(type==='staff_application') allow.push(...[config.roles.interviewer,config.roles.admin].map(id=>({id,allow:[PermissionFlagsBits.ViewChannel,PermissionFlagsBits.SendMessages,PermissionFlagsBits.ReadMessageHistory]})));
 return [everyone,...allow];
}
async function createTicketChannel(guild,user,type){ const prefix={staff_application:'application',support:'support',report:'report'}[type]; return guild.channels.create({name:`${prefix}-${safeName(user.username)}`,type:ChannelType.GuildText,parent:config.categories.tickets,permissionOverwrites:overwrites(guild,user.id,type),topic:`VR GAMERzzz | ${type} | ${user.id}`}); }
async function closeChannel(channel){ if(channel?.deletable) await channel.delete('Ticket closed'); }
module.exports={createTicketChannel,closeChannel,safeName};
