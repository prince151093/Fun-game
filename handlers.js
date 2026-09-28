const {
  ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder, ModalBuilder,
  TextInputBuilder, TextInputStyle, PermissionFlagsBits, ChannelType,
  AttachmentBuilder
} = require('discord.js');

const config = require('./config');
const db = require('./db');
const { createTicketChannel } = require('./ticketUtils');
const { makeTranscript } = require('./transcript');

const typeLabel = {
  support: '🆘 Support Ticket',
  report: '⚠️ User Report',
  staff_application: '🛡️ Staff Application'
};

const staffRoleIds = [config.roles.staff, config.roles.moderator, config.roles.admin];
const interviewerRoleIds = [config.roles.interviewer, config.roles.admin];

function panel() {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('ticket:staff_application').setLabel('Apply For Staff').setEmoji('🛡️').setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId('ticket:support').setLabel('Support Ticket').setEmoji('🆘').setStyle(ButtonStyle.Success),
    new ButtonBuilder().setCustomId('ticket:report').setLabel('Report User').setEmoji('⚠️').setStyle(ButtonStyle.Danger)
  );
}

function appModal() {
  return new ModalBuilder()
    .setCustomId('application_modal')
    .setTitle('Staff Application')
    .addComponents(
      ...[
        ['age', 'Age'],
        ['country', 'Country'],
        ['experience', 'Previous Staff Experience'],
        ['reason', 'Why do you want staff?'],
        ['choose_you', 'Why should we choose you?']
      ].map(([id, label]) =>
        new ActionRowBuilder().addComponents(
          new TextInputBuilder()
            .setCustomId(id)
            .setLabel(label)
            .setStyle(TextInputStyle.Paragraph)
            .setRequired(true)
            .setMaxLength(1000)
        )
      )
    );
}

function interviewScheduleModal(userId, ticketId) {
  return new ModalBuilder()
    .setCustomId(`application:schedule:${userId}:${ticketId}`)
    .setTitle('Schedule Staff Interview')
    .addComponents(
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId('interview_date')
          .setLabel('Interview Date (DD/MM/YYYY)')
          .setStyle(TextInputStyle.Short)
          .setPlaceholder('29/09/2026')
          .setRequired(true)
          .setMaxLength(10)
      ),
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId('interview_time')
          .setLabel('Interview Time (e.g. 09:00 PM IST)')
          .setStyle(TextInputStyle.Short)
          .setPlaceholder('09:00 PM IST')
          .setRequired(true)
          .setMaxLength(30)
      ),
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId('interview_note')
          .setLabel('Optional Interview Note')
          .setStyle(TextInputStyle.Paragraph)
          .setPlaceholder('Anything the applicant should prepare...')
          .setRequired(false)
          .setMaxLength(500)
      )
    );
}

function hasRole(i, ids) {
  return ids.some(id => i.member?.roles?.cache?.has(id));
}

async function button(i) {
  const [, type] = i.customId.split(':');
  if (!['support', 'report', 'staff_application'].includes(type)) return;

  if (type === 'staff_application') {
    return i.showModal(appModal());
  }

  await i.deferReply({ ephemeral: true });

  try {
    const existing = await db.getOpenTicket(i.guild.id, i.user.id, type);
    if (existing) {
      return i.editReply({ content: `You already have an open ${typeLabel[type]}: <#${existing.ticket_id}>` });
    }

    const ch = await createTicketChannel(i.guild, i.user, type);
    await db.createTicket({
      ticket_id: ch.id,
      guild_id: i.guild.id,
      user_id: i.user.id,
      type,
      status: 'pending',
      claimed_by: null
    });

    const embed = new EmbedBuilder()
      .setTitle(typeLabel[type])
      .setDescription(
        type === 'report'
          ? 'Please include the reported user, relevant message links, and what happened.'
          : 'Please describe your issue. A staff member will assist you shortly.'
      )
      .setColor(config.colors[type === 'report' ? 'report' : 'support']);

    await ch.send({
      content: `<@${i.user.id}>`,
      embeds: [embed],
      components: [
        new ActionRowBuilder().addComponents(
          new ButtonBuilder()
            .setCustomId(`ticket:close:${ch.id}`)
            .setLabel('Close Ticket')
            .setEmoji('🔒')
            .setStyle(ButtonStyle.Secondary)
        )
      ]
    });

    return i.editReply({ content: `Your ticket has been created: <#${ch.id}>` });
  } catch (error) {
    console.error('Ticket creation error:', error);
    return i.editReply({ content: 'Could not create the ticket. Please try again or contact an administrator.' }).catch(() => {});
  }
}

async function application(i) {
  const vals = Object.fromEntries(
    ['age', 'country', 'experience', 'reason', 'choose_you']
      .map(k => [k, i.fields.getTextInputValue(k)])
  );

  await i.deferReply({ ephemeral: true });

  try {
    const existing = await db.getOpenTicket(i.guild.id, i.user.id, 'staff_application');
    if (existing) {
      return i.editReply({ content: `You already have an open application: <#${existing.ticket_id}>` });
    }

    const ch = await createTicketChannel(i.guild, i.user, 'staff_application');

    await db.createTicket({
      ticket_id: ch.id,
      guild_id: i.guild.id,
      user_id: i.user.id,
      type: 'staff_application',
      status: 'pending',
      claimed_by: null
    });

    await db.createApplication({
      user_id: i.user.id,
      age: vals.age,
      country: vals.country,
      experience: vals.experience,
      reason: vals.reason,
      choose_you: vals.choose_you,
      status: 'Pending',
      interviewer_id: null,
      interview_vc: null,
      interview_time: null,
      interview_note: null
    });

    const embed = new EmbedBuilder()
      .setTitle('🛡️ Staff Application')
      .setDescription(
        Object.entries(vals)
          .map(([k, v]) => `**${k.replace('_', ' ')}**\n${v}`)
          .join('\n\n')
      )
      .setColor(config.colors.staff);

    const queue = await i.guild.channels.fetch(config.channels.applicationQueue);

    await queue.send({
      content: `<@&${config.roles.interviewer}>`,
      embeds: [embed],
      components: [
        new ActionRowBuilder().addComponents(
          new ButtonBuilder()
            .setCustomId(`application:accept:${i.user.id}:${ch.id}`)
            .setLabel('Accept Interview')
            .setEmoji('📅')
            .setStyle(ButtonStyle.Success),
          new ButtonBuilder()
            .setCustomId(`application:reject:${i.user.id}:${ch.id}`)
            .setLabel('Reject')
            .setEmoji('❌')
            .setStyle(ButtonStyle.Danger)
        )
      ]
    });

    await ch.send({
      content: `<@${i.user.id}>`,
      embeds: [
        new EmbedBuilder()
          .setTitle('Application Submitted')
          .setDescription('Your staff application has been submitted successfully. An interviewer will review it and schedule an interview if selected.')
          .setColor(config.colors.staff)
      ]
    });

    return i.editReply({ content: `Application submitted: <#${ch.id}>` });
  } catch (error) {
    console.error('Application creation error:', error);
    return i.editReply({ content: 'Your application could not be processed. Please try again or contact an administrator.' }).catch(() => {});
  }
}

async function applicationAction(i) {
  const [, action, userId, ticketId] = i.customId.split(':');

  if (!hasRole(i, interviewerRoleIds)) {
    return i.reply({ content: 'You do not have permission to manage applications.', ephemeral: true });
  }

  // IMPORTANT: Accept opens a modal as the immediate Discord interaction response.
  // This prevents "This application did not respond" while the bot is doing DB/channel work.
  if (action === 'accept') {
    // Show the modal immediately so Discord acknowledges the button interaction
    // before any database/channel operations can cause an interaction timeout.
    return i.showModal(interviewScheduleModal(userId, ticketId));
  }

  await i.deferReply({ ephemeral: true });

  try {
    await db.updateApplication(userId, {
      status: 'Rejected',
      interviewer_id: i.user.id,
      interview_time: null,
      interview_note: null
    });

    await db.updateTicket(ticketId, {
      status: 'rejected',
      claimed_by: i.user.id
    });

    const applicant = await i.guild.members.fetch(userId).catch(() => null);

    if (applicant) {
      await applicant.send(
        `Your VR GAMERzzz staff application was not accepted. Thank you for applying.`
      ).catch(() => {});
    }

    await i.message.edit({ components: [] }).catch(() => {});

    // Rejection is a conclusion, so clean up the temporary application ticket.
    const ticket = await i.guild.channels.fetch(ticketId).catch(() => null);
    if (ticket) {
      await saveTranscriptAndDelete(ticket, i.guild, userId, i.user.id);
    }

    return i.editReply({ content: 'Application rejected. The temporary application ticket has been cleaned up.' });
  } catch (error) {
    console.error('Application rejection error:', error);
    return i.editReply({ content: 'Could not reject the application. Please try again.' }).catch(() => {});
  }
}

async function scheduleInterview(i) {
  const [, , userId, ticketId] = i.customId.split(':');

  if (!hasRole(i, interviewerRoleIds)) {
    return i.reply({ content: 'You do not have permission to schedule interviews.', ephemeral: true });
  }

  const date = i.fields.getTextInputValue('interview_date').trim();
  const time = i.fields.getTextInputValue('interview_time').trim();
  const note = i.fields.getTextInputValue('interview_note').trim();

  // Basic professional validation.
  if (!/^\d{2}\/\d{2}\/\d{4}$/.test(date)) {
    return i.reply({ content: 'Please enter the date in DD/MM/YYYY format.', ephemeral: true });
  }

  await i.deferReply({ ephemeral: true });

  try {
    const app = await db.getApplicationByUser(userId);
    if (!app || ['Accepted', 'Rejected', 'Interview Scheduled'].includes(app.status)) {
      return i.editReply({
        content: !app
          ? 'This application is no longer available for interview scheduling.'
          : app.status === 'Interview Scheduled'
            ? 'This interview has already been scheduled.'
            : 'This application is already concluded.'
      });
    }

    const applicant = await i.guild.members.fetch(userId);
    const guild = i.guild;

    const vc = await guild.channels.create({
      name: `interview-${applicant.user.username}`.slice(0, 90),
      type: ChannelType.GuildVoice,
      parent: config.categories.tickets,
      permissionOverwrites: [
        {
          id: guild.roles.everyone.id,
          deny: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.Connect]
        },
        {
          id: userId,
          allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.Connect, PermissionFlagsBits.Speak]
        },
        {
          id: i.user.id,
          allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.Connect, PermissionFlagsBits.Speak]
        },
        {
          id: config.roles.admin,
          allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.Connect, PermissionFlagsBits.Speak]
        }
      ]
    });

    const scheduleText = `**${date} at ${time} (IST)**`;

    await db.updateApplication(userId, {
      status: 'Interview Scheduled',
      interviewer_id: i.user.id,
      interview_vc: vc.id,
      interview_time: scheduleText,
      interview_note: note || null
    });

    await db.updateTicket(ticketId, {
      status: 'interview_scheduled',
      claimed_by: i.user.id
    });

    const ticket = await guild.channels.fetch(ticketId).catch(() => null);

    if (ticket) {
      await ticket.send({
        content: `<@${userId}>`,
        embeds: [
          new EmbedBuilder()
            .setTitle('📅 Staff Interview Scheduled')
            .setDescription(
              [
                `**Applicant:** <@${userId}>`,
                `**Interviewer:** <@${i.user.id}>`,
                `**Date & Time:** ${scheduleText}`,
                `**Interview VC:** <#${vc.id}>`,
                note ? `**Note:** ${note}` : null,
                '',
                'Please join the interview VC at the scheduled time.',
                'After the interview, the interviewer must select the final decision below.'
              ].filter(Boolean).join('\n')
            )
            .setColor(config.colors.staff)
            .setFooter({ text: 'VR GAMERzzz • Staff Recruitment' })
        ],
        components: [
          new ActionRowBuilder().addComponents(
            new ButtonBuilder()
              .setCustomId(`application:decision:accept:${userId}:${ticketId}:${vc.id}`)
              .setLabel('Accept Applicant')
              .setEmoji('✅')
              .setStyle(ButtonStyle.Success),
            new ButtonBuilder()
              .setCustomId(`application:decision:reject:${userId}:${ticketId}:${vc.id}`)
              .setLabel('Reject Applicant')
              .setEmoji('❌')
              .setStyle(ButtonStyle.Danger)
          )
        ]
      });
    }

    await applicant.send({
      content: `<@${userId}>`,
      embeds: [
        new EmbedBuilder()
          .setTitle('📅 Your Staff Interview Is Scheduled')
          .setDescription(
            [
              `**Interviewer:** <@${i.user.id}>`,
              `**Date & Time:** ${scheduleText}`,
              `**Interview VC:** <#${vc.id}>`,
              note ? `**Note:** ${note}` : null,
              '',
              'Please join the voice channel at the scheduled time.'
            ].filter(Boolean).join('\n')
          )
          .setColor(config.colors.staff)
          .setFooter({ text: 'VR GAMERzzz • Staff Recruitment' })
      ]
    }).catch(() => {});

    return i.editReply({
      content: `Interview scheduled for **${date} at ${time} IST**. The applicant has been notified and tagged in the ticket.`
    });
  } catch (error) {
    console.error('Interview scheduling error:', error);
    return i.editReply({ content: 'Could not schedule the interview. Please check the bot permissions and try again.' }).catch(() => {});
  }
}

async function decision(i) {
  const [, kind, action, userId, ticketId, vcId] = i.customId.split(':');

  if (!hasRole(i, interviewerRoleIds)) {
    return i.reply({ content: 'You do not have permission to manage applications.', ephemeral: true });
  }

  await i.deferReply({ ephemeral: true });

  try {
    const accepted = action === 'accept';

    await db.updateApplication(userId, {
      status: accepted ? 'Accepted' : 'Rejected',
      interviewer_id: i.user.id
    });

    await db.updateTicket(ticketId, {
      status: accepted ? 'accepted' : 'rejected',
      claimed_by: i.user.id
    });

    if (accepted && process.env.AUTO_GIVE_STAFF_ROLE === 'true') {
      const m = await i.guild.members.fetch(userId).catch(() => null);
      if (m) {
        await m.roles.add(config.roles.staff).catch(e =>
          console.error('Could not assign Staff role:', e.message)
        );
      }
    }

    const applicant = await i.guild.members.fetch(userId).catch(() => null);

    if (applicant) {
      await applicant.send({
        content: accepted
          ? `🎉 <@${userId}> Your VR GAMERzzz staff application has been accepted!`
          : `<@${userId}> Your VR GAMERzzz staff application was not accepted. Thank you for applying.`
      }).catch(() => {});
    }

    await i.editReply({
      content: accepted
        ? 'Applicant accepted. The applicant has been notified and the temporary interview channels will now be cleaned up.'
        : 'Applicant rejected. The applicant has been notified and the temporary interview channels will now be cleaned up.'
    });

    await i.message.edit({ components: [] }).catch(() => {});

    // Final conclusion: delete BOTH the interview VC and the temporary ticket.
    const vc = await i.guild.channels.fetch(vcId).catch(() => null);
    if (vc) await vc.delete('Interview completed - automatic cleanup').catch(() => {});

    const ticket = await i.guild.channels.fetch(ticketId).catch(() => null);
    if (ticket) {
      await saveTranscriptAndDelete(ticket, i.guild, userId, i.user.id);
    }
  } catch (error) {
    console.error('Application decision error:', error);
    return i.editReply({ content: 'Could not complete the application decision. Please try again.' }).catch(() => {});
  }
}

async function saveTranscriptAndDelete(channel, guild, userId, closedBy) {
  try {
    const html = await makeTranscript(channel);
    const logs = await guild.channels.fetch(config.channels.logs).catch(() => null);

    if (logs) {
      await logs.send({
        content: `Transcript: **${channel.name}** | Creator: <@${userId}> | Closed by: <@${closedBy}>`,
        files: [
          new AttachmentBuilder(
            Buffer.from(html, 'utf8'),
            { name: `${channel.id}-transcript.html` }
          )
        ]
      });
    }
  } catch (e) {
    console.error('Transcript/log error:', e);
  }

  await channel.delete('Temporary ticket cleanup').catch(() => {});
}

async function close(i) {
  const ch = i.channel;
  const row = await db.getTicketById(ch.id).catch(() => null);

  if (!row) {
    return i.reply({
      content: 'Ticket record not found; ask an administrator for help.',
      ephemeral: true
    });
  }

  if (i.user.id !== row.user_id && !hasRole(i, staffRoleIds)) {
    return i.reply({
      content: 'Only the ticket creator or authorized staff can close this ticket.',
      ephemeral: true
    });
  }

  await i.reply({
    content: 'Closing ticket and preparing transcript...',
    ephemeral: true
  });

  await saveTranscriptAndDelete(ch, i.guild, row.user_id, i.user.id);
}

module.exports = {
  panel,
  button,
  application,
  close,
  applicationAction,
  scheduleInterview,
  decision
};
