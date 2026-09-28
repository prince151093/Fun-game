const {ActionRowBuilder,ButtonBuilder,ButtonStyle,EmbedBuilder,ModalBuilder,TextInputBuilder,TextInputStyle,PermissionFlagsBits,AttachmentBuilder}=require('discord.js');
const config=require('./config');
const db=require('./db');
const {createTicketChannel}=require('./ticketUtils');
const {makeTranscript}=require('./transcript');

const typeLabel={support:'🆘 Support Ticket',report:'⚠️ User Report',staff_application:'🛡️ Staff Application'};
const staffRoleIds=[config.roles.staff,config.roles.moderator,config.roles.admin];

function panel(){
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('ticket:staff_application').setLabel('Apply For Staff').setEmoji('🛡️').setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId('ticket:support').setLabel('Support Ticket').setEmoji('🆘').setStyle(ButtonStyle.Success),
    new ButtonBuilder().setCustomId('ticket:report').setLabel('Report User').setEmoji('⚠️').setStyle(ButtonStyle.Danger)
  );
}

function appModal(){
  return new ModalBuilder().setCustomId('application_modal').setTitle('Staff Application').addComponents(
    ...[['age','Age'],['country','Country'],['experience','Previous Staff Experience'],['reason','Why do you want staff?'],['choose_you','Why should we choose you?']]
      .map(([id,label])=>new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId(id).setLabel(label).setStyle(TextInputStyle.Paragraph).setRequired(true).setMaxLength(1000)))
  );
}

function scheduleModal(userId,ticketId){
  return new ModalBuilder().setCustomId(`application_schedule:${userId}:${ticketId}`).setTitle('Schedule Staff Interview').addComponents(
    new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('interview_date').setLabel('Interview Date (DD/MM/YYYY)').setPlaceholder('29/09/2026').setStyle(TextInputStyle.Short).setRequired(true).setMaxLength(10)),
    new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('interview_time').setLabel('Interview Time (IST)').setPlaceholder('09:00 PM').setStyle(TextInputStyle.Short).setRequired(true).setMaxLength(20)),
    new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('interview_note').setLabel('Interview Note (Optional)').setPlaceholder('Any instructions for the applicant').setStyle(TextInputStyle.Paragraph).setRequired(false).setMaxLength(500))
  );
}

function hasRole(i,ids){return ids.some(id=>i.member?.roles?.cache?.has(id));}

async function button(i){
  const [,type]=i.customId.split(':');
  if(!['support','report','staff_application'].includes(type))return;
  if(type==='staff_application')return i.showModal(appModal());

  await i.deferReply({ephemeral:true});
  const existing=await db.getOpenTicket(i.guild.id,i.user.id,type);
  if(existing)return i.editReply({content:`You already have an open ${typeLabel[type]}: <#${existing.ticket_id}>`});
  const ch=await createTicketChannel(i.guild,i.user,type);
  await db.createTicket({ticket_id:ch.id,guild_id:i.guild.id,user_id:i.user.id,type,status:'pending',claimed_by:null});
  const embed=new EmbedBuilder().setTitle(typeLabel[type]).setDescription(type==='report'?'Please include the reported user, relevant message links, and what happened.':'Please describe your issue. A staff member will assist you shortly.').setColor(config.colors[type==='report'?'report':'support']);
  await ch.send({content:`<@${i.user.id}>`,embeds:[embed],components:[new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId(`ticket:close:${ch.id}`).setLabel('Close Ticket').setEmoji('🔒').setStyle(ButtonStyle.Secondary))]});
  return i.editReply({content:`Your ticket has been created: <#${ch.id}>`});
}

async function application(i){
  const vals=Object.fromEntries(['age','country','experience','reason','choose_you'].map(k=>[k,i.fields.getTextInputValue(k)]));
  await i.deferReply({ephemeral:true});
  const existing=await db.getOpenTicket(i.guild.id,i.user.id,'staff_application');
  if(existing)return i.editReply({content:`You already have an open application: <#${existing.ticket_id}>`});
  const ch=await createTicketChannel(i.guild,i.user,'staff_application');
  await db.createTicket({ticket_id:ch.id,guild_id:i.guild.id,user_id:i.user.id,type:'staff_application',status:'pending',claimed_by:null});
  await db.createApplication({user_id:i.user.id,age:vals.age,country:vals.country,experience:vals.experience,reason:vals.reason,choose_you:vals.choose_you,status:'Pending',interviewer_id:null,interview_vc:null,interview_time:null,interview_note:null});
  const embed=new EmbedBuilder().setTitle('🛡️ Staff Application').setDescription(Object.entries(vals).map(([k,v])=>`**${k.replace('_',' ')}**\n${v}`).join('\n\n')).setColor(config.colors.staff);
  const queue=await i.guild.channels.fetch(config.channels.applicationQueue);
  await queue.send({content:`<@&${config.roles.interviewer}>`,embeds:[embed],components:[new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId(`application:accept:${i.user.id}:${ch.id}`).setLabel('Accept Interview').setStyle(ButtonStyle.Success),new ButtonBuilder().setCustomId(`application:reject:${i.user.id}:${ch.id}`).setLabel('Reject').setStyle(ButtonStyle.Danger))]});
  await ch.send({content:`<@${i.user.id}> Your application has been submitted. Please wait for an interviewer.`});
  return i.editReply({content:`Application submitted: <#${ch.id}>`});
}

async function applicationAction(i){
  const [,action,userId,ticketId]=i.customId.split(':');
  if(!hasRole(i,[config.roles.interviewer,config.roles.admin]))return i.reply({content:'You do not have permission to manage applications.',ephemeral:true});

  if(action==='accept'){
    try {
      await i.showModal(scheduleModal(userId,ticketId));
      return;
    } catch (err) {
      console.error('Accept Interview modal error:', err);
      if (!i.replied && !i.deferred) {
        await i.reply({content:'Could not open the interview scheduler. Please try again.',ephemeral:true}).catch(()=>{});
      }
      return;
    }
  }

  await i.deferReply({ephemeral:true});
  if(action==='reject'){
    await db.updateApplication(userId,{status:'Rejected',interviewer_id:i.user.id});
    await db.updateTicket(ticketId,{status:'rejected',claimed_by:i.user.id});
    const applicant=await i.guild.members.fetch(userId).catch(()=>null);
    if(applicant)await applicant.send('Your VR GAMERzzz staff application was not accepted. Thank you for applying.').catch(()=>{});
    await i.message.edit({components:[]}).catch(()=>{});
    return i.editReply({content:'Application rejected.'});
  }
}

async function scheduleApplication(i){
  const [,userId,ticketId]=i.customId.split(':');
  if(!hasRole(i,[config.roles.interviewer,config.roles.admin]))return i.reply({content:'You do not have permission to schedule applications.',ephemeral:true});
  await i.deferReply({ephemeral:true});

  const date=i.fields.getTextInputValue('interview_date').trim();
  const time=i.fields.getTextInputValue('interview_time').trim();
  const note=i.fields.getTextInputValue('interview_note').trim();
  const applicant=await i.guild.members.fetch(userId).catch(()=>null);
  if(!applicant)return i.editReply({content:'Applicant is no longer in the server.'});
  const ticket=await i.guild.channels.fetch(ticketId).catch(()=>null);
  if(!ticket)return i.editReply({content:'Application ticket could not be found.'});

  const vc=await i.guild.channels.create({
    name:`interview-${applicant.user.username}`.slice(0,90),
    type:2,
    parent:config.categories.tickets,
    permissionOverwrites:[
      {id:i.guild.roles.everyone.id,deny:[PermissionFlagsBits.ViewChannel,PermissionFlagsBits.Connect]},
      {id:userId,allow:[PermissionFlagsBits.ViewChannel,PermissionFlagsBits.Connect,PermissionFlagsBits.Speak]},
      {id:i.user.id,allow:[PermissionFlagsBits.ViewChannel,PermissionFlagsBits.Connect,PermissionFlagsBits.Speak]},
      {id:config.roles.admin,allow:[PermissionFlagsBits.ViewChannel,PermissionFlagsBits.Connect,PermissionFlagsBits.Speak]}
    ]
  });

  await db.updateApplication(userId,{status:'Interview Scheduled',interviewer_id:i.user.id,interview_vc:vc.id,interview_time:`${date} at ${time} IST`,interview_note:note||null});
  await db.updateTicket(ticketId,{status:'interview_scheduled',claimed_by:i.user.id});

  const scheduleEmbed=new EmbedBuilder()
    .setTitle('📅 Interview Scheduled')
    .setDescription(`Your staff interview has been scheduled, <@${userId}>.`)
    .addFields(
      {name:'📅 Date',value:date,inline:true},
      {name:'🕐 Time',value:`${time} IST`,inline:true},
      {name:'🎙️ Interview Room',value:`${vc}`,inline:false},
      {name:'👤 Interviewer',value:`<@${i.user.id}>`,inline:true},
      {name:'📝 Note',value:note||'No additional instructions.',inline:false}
    )
    .setColor(config.colors.staff);

  await ticket.send({content:`<@${userId}>`,embeds:[scheduleEmbed],components:[new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId(`application:decision:accept:${userId}:${ticketId}:${vc.id}`).setLabel('Accept Applicant').setStyle(ButtonStyle.Success),new ButtonBuilder().setCustomId(`application:decision:reject:${userId}:${ticketId}:${vc.id}`).setLabel('Reject Applicant').setStyle(ButtonStyle.Danger))]});
  await applicant.send({content:`<@${userId}>`,embeds:[scheduleEmbed]}).catch(()=>{});
  await i.message.edit({components:[]}).catch(()=>{});
  return i.editReply({content:`Interview scheduled successfully. ${vc}`});
}

async function cleanupApplication(i,userId,ticketId,vcId,accepted){
  const ticket=await i.guild.channels.fetch(ticketId).catch(()=>null);
  if(ticket){
    const row=await db.getTicketById(ticketId).catch(()=>null);
    try{
      const html=await makeTranscript(ticket);
      const logs=await i.guild.channels.fetch(config.channels.logs).catch(()=>null);
      if(logs)await logs.send({content:`Staff application transcript | Result: **${accepted?'Accepted':'Rejected'}** | Applicant: <@${userId}> | Interviewer: <@${i.user.id}>`,files:[new AttachmentBuilder(Buffer.from(html,'utf8'),{name:`${ticketId}-transcript.html`})]});
    }catch(e){console.error('Application transcript error:',e);}
    await db.updateTicket(ticketId,{status:accepted?'accepted':'rejected',claimed_by:i.user.id}).catch(()=>{});
    setTimeout(()=>ticket.delete('Staff application completed').catch(()=>{}),1000);
  }
  const vc=await i.guild.channels.fetch(vcId).catch(()=>null);
  if(vc)setTimeout(()=>vc.delete('Interview completed').catch(()=>{}),1000);
}

async function decision(i){
  const [,kind,action,userId,ticketId,vcId]=i.customId.split(':');
  if(!hasRole(i,[config.roles.interviewer,config.roles.admin]))return i.reply({content:'You do not have permission to manage applications.',ephemeral:true});
  await i.deferReply({ephemeral:true});
  const accepted=action==='accept';
  await db.updateApplication(userId,{status:accepted?'Accepted':'Rejected',interviewer_id:i.user.id});
  if(accepted&&process.env.AUTO_GIVE_STAFF_ROLE==='true'){
    const m=await i.guild.members.fetch(userId).catch(()=>null);
    if(m)await m.roles.add(config.roles.staff).catch(e=>console.error('Could not assign Staff role:',e.message));
  }
  const m=await i.guild.members.fetch(userId).catch(()=>null);
  if(m)await m.send(accepted?'Your VR GAMERzzz staff application was accepted!':'Your VR GAMERzzz staff application was not accepted. Thank you for applying.').catch(()=>{});
  await i.message.edit({components:[]}).catch(()=>{});
  await i.editReply({content:accepted?'Applicant accepted. Cleaning up the interview room and ticket...':'Applicant rejected. Cleaning up the interview room and ticket...'});
  await cleanupApplication(i,userId,ticketId,vcId,accepted);
}

async function close(i){
  const ch=i.channel;
  const row=await db.getTicketById(ch.id).catch(()=>null);
  if(!row)return i.reply({content:'Ticket record not found; ask an administrator for help.',ephemeral:true});
  if(i.user.id!==row.user_id&&!hasRole(i,staffRoleIds))return i.reply({content:'Only the ticket creator or authorized staff can close this ticket.',ephemeral:true});
  await i.reply({content:'Closing ticket and preparing transcript...',ephemeral:true});
  try{
    const html=await makeTranscript(ch);
    const logs=await i.guild.channels.fetch(config.channels.logs);
    await logs.send({content:`Transcript: **${ch.name}** | Creator: <@${row.user_id}> | Closed by: <@${i.user.id}>`,files:[new AttachmentBuilder(Buffer.from(html,'utf8'),{name:`${ch.id}-transcript.html`})]});
    await db.updateTicket(ch.id,{status:'closed'});
  }catch(e){console.error('Transcript/log error:',e);}
  setTimeout(()=>ch.delete('Ticket closed').catch(()=>{}),1500);
}

module.exports={panel,button,application,close,applicationAction,scheduleApplication,decision};
