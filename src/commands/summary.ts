import type { ChatInputCommandInteraction } from "discord.js";
import { EmbedBuilder, MessageFlags, SlashCommandBuilder } from "discord.js";
import { and, eq, gte, isNotNull } from "drizzle-orm";
import { db } from "../db";
import { games } from "../schema";

export const data = new SlashCommandBuilder()
  .setName("summary")
  .setDescription(
    "Replies with a summary of recent games for the last 24 hours.",
  )
  .addUserOption((option) =>
    option
      .setName("user")
      .setDescription(
        "The user to check the summary for (defaults to yourself)",
      )
      .setRequired(false),
  );

export async function execute(interaction: ChatInputCommandInteraction) {
  try {
    const targetUser = interaction.options.getUser("user") ?? interaction.user;
    const userId = targetUser.id;
    const isSelf = targetUser.id === interaction.user.id;
    const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);

    // Fetch all completed game sessions from the last 24 hours
    const recentGames = await db
      .select()
      .from(games)
      .where(
        and(
          eq(games.user_id, userId),
          gte(games.created_at, twentyFourHoursAgo),
          isNotNull(games.end_time),
        ),
      );

    if (recentGames.length === 0) {
      await interaction.reply({
        content: isSelf
          ? "You haven't played any games in the last 24 hours."
          : `${targetUser.displayName} hasn't played any games in the last 24 hours.`,
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    // Group games by name and calculate total time
    const gameStats = new Map<string, number>();

    for (const game of recentGames) {
      if (!game.end_time) continue;

      const duration = game.end_time.getTime() - game.start_time.getTime();
      const existing = gameStats.get(game.name) || 0;

      gameStats.set(game.name, existing + duration);
    }

    // Format the stats
    const formatDuration = (ms: number): string => {
      const hours = Math.floor(ms / (1000 * 60 * 60));
      const minutes = Math.floor((ms % (1000 * 60 * 60)) / (1000 * 60));

      if (hours > 0) {
        return `${hours}h ${minutes}m`;
      }
      return `${minutes}m`;
    };

    // Sort by total time played (descending)
    const sortedGames = [...gameStats.entries()].sort((a, b) => b[1] - a[1]);

    // Calculate total time across all games
    const totalTime = sortedGames.reduce((acc, [, ms]) => acc + ms, 0);

    // Build the embed
    const embed = new EmbedBuilder()
      .setTitle(
        isSelf ? "Last 24 Hours" : `${targetUser.displayName}'s Last 24 Hours`,
      )
      .setColor(0x5865f2);

    const gameList = sortedGames
      .map(([name, ms]) => `${name} - ${formatDuration(ms)}`)
      .join("\n");

    embed.setDescription(gameList);
    embed.setFooter({ text: `Total: ${formatDuration(totalTime)}` });

    await interaction.reply({ embeds: [embed] });
  } catch (error) {
    console.error(error);
    await interaction.reply({
      content: "An error occurred.",
      flags: MessageFlags.Ephemeral,
    });
  }
}
