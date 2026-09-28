const { SlashCommandBuilder } = require("discord.js");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("stats")
    .setDescription("View your ticket stats"),

  async execute(interaction) {
    await interaction.reply({
      content: "Stats system coming later.",
      ephemeral: true
    });
  }
};