import {
  type ChatInputCommandInteraction,
  SlashCommandBuilder,
  MessageFlags,
} from "discord.js";
import { eq } from "drizzle-orm";
import { ResultAsync } from "neverthrow";
import { db } from "../db";
import { leagueAccounts, users } from "../schema";
import { getLogger } from "log4js";

const logger = getLogger();

export const data = new SlashCommandBuilder()
  .setName("register_league_account")
  .setDescription("Register your League of Legends account")
  .addStringOption((option) =>
    option
      .setName("game_name")
      .setDescription("Your Riot game name (e.g. PlayerName)")
      .setRequired(true),
  )
  .addStringOption((option) =>
    option
      .setName("tag_line")
      .setDescription("Your Riot tag line, after the hash (e.g. EUW)")
      .setRequired(true),
  )
  .addUserOption((option) =>
    option
      .setName("user")
      .setDescription("The user to register (defaults to yourself)")
      .setRequired(false),
  );

const validateAccount = async (name: string, tagLine: string) => {
  const response = await ResultAsync.fromPromise(
    fetch(
      `https://europe.api.riotgames.com/riot/account/v1/accounts/by-riot-id/${encodeURIComponent(name)}/${encodeURIComponent(tagLine)}`,
      { headers: { "X-Riot-Token": process.env.RIOT_API_KEY! } },
    ),
    () => new Error("Failed to call Riot API for accounts"),
  );
  if (response.isErr()) {
    logger.error(response.error);
    return { success: false, error: response.error };
  }
  const responseJson = await ResultAsync.fromPromise(
    response.value.json(),
    () => new Error("Failed to marshal lol account response into json"),
  );
  if (responseJson.isErr()) {
    logger.error(responseJson.error);
    return { success: false, error: responseJson.error };
  }
  return {
    success: true,
    response: responseJson.value as {
      puuid: string;
      gameName: string;
      tagLine: string;
    },
  };
};

export async function execute(interaction: ChatInputCommandInteraction) {
  const gameName = interaction.options.get("game_name", true).value as string;
  const tagLine = interaction.options.get("tag_line", true).value as string;
  const targetUser = interaction.options.getUser("user") ?? interaction.user;
  const userId = targetUser.id;
  const isSelf = targetUser.id === interaction.user.id;

  const [existingUser] = await db
    .select()
    .from(users)
    .where(eq(users.id, userId));

  if (!existingUser) {
    await db.insert(users).values({
      id: userId,
      name: interaction.user.username,
      display_name: interaction.user.displayName,
      avatar: interaction.user.avatarURL(),
    });
  }

  const [existingAccount] = await db
    .select()
    .from(leagueAccounts)
    .where(eq(leagueAccounts.user_id, userId));

  const account = await validateAccount(gameName, tagLine);
  if (!account.success || account.response === undefined) {
    await interaction.reply({
      content: isSelf
        ? `Failed to validate your account: ${account.error}`
        : `${targetUser.displayName} failed to validate their account: ${account.error}`,
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  if (existingAccount) {
    await db
      .update(leagueAccounts)
      .set({
        game_name: gameName,
        tag_line: tagLine,
        puuid: account.response.puuid,
      })
      .where(eq(leagueAccounts.user_id, userId));

    await interaction.reply({
      content: isSelf
        ? `Updated your League account to **${gameName}#${tagLine}**`
        : `${targetUser.displayName} updated their League account to **${gameName}#${tagLine}**`,
      flags: MessageFlags.Ephemeral,
    });
  } else {
    await db.insert(leagueAccounts).values({
      user_id: userId,
      game_name: gameName,
      tag_line: tagLine,
      puuid: account.response.puuid,
    });

    await interaction.reply({
      content: isSelf
        ? `Registered your League account: **${gameName}#${tagLine}**`
        : `${targetUser.displayName} registered their League account: **${gameName}#${tagLine}**`,
      flags: MessageFlags.Ephemeral,
    });
  }
}
