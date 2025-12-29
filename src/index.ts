import { ActivityType, Client, Events, GatewayIntentBits } from "discord.js";
import { getLogger } from "log4js";
import { db } from "./db";
import { users, games } from "./schema";
import { eq, and, isNull, sql } from "drizzle-orm";

const logger = getLogger();
logger.level = "info";

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildPresences,
  ],
});

client.once(Events.ClientReady, (c) => {
  logger.info(`Ready! Logged in as ${c.user.tag}!`);
});

client.login(process.env.DISCORD_TOKEN);

client.on(Events.PresenceUpdate, async (oldPresence, newPresence) => {
  const user = newPresence.user;
  if (!user) {
    logger.error("User not found in presence update");
    return;
  }

  const [dbUser] = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.id, user.id));

  if (!dbUser) {
    await db.insert(users).values({
      id: user.id,
      name: user.username,
      display_name: user.displayName,
      avatar: user.avatarURL(),
    });
  }

  const oldGame = oldPresence?.activities.find(
    (a) => a.type === ActivityType.Playing,
  );
  const newGame = newPresence?.activities.find(
    (a) => a.type === ActivityType.Playing,
  );

  if (!oldGame && newGame) {
    logger.info(`New game started: ${newGame.name} - ${user.tag}`);
    await db.insert(games).values({
      user_id: user.id,
      name: newGame.name,
    });
  } else if (oldGame && !newGame) {
    logger.info(`Game ended: ${oldGame.name} - ${user.tag}`);
    await db
      .update(games)
      .set({ end_time: sql`(current_timestamp)` })
      .where(
        and(
          eq(games.user_id, user.id),
          eq(games.name, oldGame.name),
          isNull(games.end_time),
        ),
      );
  } else if (oldGame && newGame && (oldGame.name !== newGame.name)) {
    logger.info(
      `Game updated: ${oldGame.name} -> ${newGame.name} - ${user.tag}`,
    );
    await db
      .update(games)
      .set({ end_time: sql`(current_timestamp)` })
      .where(
        and(
          eq(games.user_id, user.id),
          eq(games.name, oldGame.name),
          isNull(games.end_time),
        ),
      );
    await db.insert(games).values({
      user_id: user.id,
      name: newGame.name,
    });
  }
});

const _server = Bun.serve({
  port: 3000,
  fetch(request) {
    return new Response("OK");
  },
});
