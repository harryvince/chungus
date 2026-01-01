import { ActivityType, Events, type Presence } from "discord.js";
import { and, eq, isNull, sql } from "drizzle-orm";
import { getLogger } from "log4js";
import { db } from "../db";
import {
  activeGamePlayers,
  gamesEnded,
  gamesStarted,
  presenceUpdates,
} from "../metrics";
import { games, users } from "../schema";
import type { Event } from "../types";

const logger = getLogger();

export function init(): Event {
  return {
    name: Events.PresenceUpdate,
    once: false,
    execute,
  };
}

async function execute(oldPresence: Presence | null, newPresence: Presence) {
  presenceUpdates.inc();

  const user = newPresence.user;
  if (!user) {
    logger.error("User not found in presence update");
    return;
  }

  await upsertUser(user);

  const oldGame = oldPresence?.activities.find(
    (a) => a.type === ActivityType.Playing,
  );
  const newGame = newPresence?.activities.find(
    (a) => a.type === ActivityType.Playing,
  );

  if (!oldGame && newGame) {
    await handleGameStarted(user, newGame.name);
  } else if (oldGame && !newGame) {
    await handleGameEnded(user, oldGame.name);
  } else if (oldGame && newGame && oldGame.name !== newGame.name) {
    await handleGameSwitched(user, oldGame.name, newGame.name);
  }
}

async function upsertUser(user: NonNullable<Presence["user"]>) {
  const [dbUser] = await db.select().from(users).where(eq(users.id, user.id));

  if (!dbUser) {
    await db.insert(users).values({
      id: user.id,
      name: user.username,
      display_name: user.displayName,
      avatar: user.avatarURL(),
    });
  } else if (dbUser.display_name !== user.displayName) {
    await db
      .update(users)
      .set({ display_name: user.displayName })
      .where(eq(users.id, user.id));
  }
}

async function handleGameStarted(
  user: NonNullable<Presence["user"]>,
  gameName: string,
) {
  logger.info(`New game started: ${gameName} - ${user.tag}`);
  gamesStarted.labels(gameName).inc();
  activeGamePlayers.labels(gameName).inc();
  await db.insert(games).values({
    user_id: user.id,
    name: gameName,
  });
}

async function handleGameEnded(
  user: NonNullable<Presence["user"]>,
  gameName: string,
) {
  logger.info(`Game ended: ${gameName} - ${user.tag}`);
  gamesEnded.labels(gameName).inc();
  await safeDecrementActivePlayers(gameName);
  await db
    .update(games)
    .set({ end_time: sql`(current_timestamp)` })
    .where(
      and(
        eq(games.user_id, user.id),
        eq(games.name, gameName),
        isNull(games.end_time),
      ),
    );
}

async function handleGameSwitched(
  user: NonNullable<Presence["user"]>,
  oldGameName: string,
  newGameName: string,
) {
  logger.info(`Game updated: ${oldGameName} -> ${newGameName} - ${user.tag}`);
  gamesEnded.labels(oldGameName).inc();
  gamesStarted.labels(newGameName).inc();
  await safeDecrementActivePlayers(oldGameName);
  activeGamePlayers.labels(newGameName).inc();
  await db
    .update(games)
    .set({ end_time: sql`(current_timestamp)` })
    .where(
      and(
        eq(games.user_id, user.id),
        eq(games.name, oldGameName),
        isNull(games.end_time),
      ),
    );
  await db.insert(games).values({
    user_id: user.id,
    name: newGameName,
  });
}

async function safeDecrementActivePlayers(gameName: string) {
  const gaugeData = await activeGamePlayers.get();
  const currentValue =
    gaugeData.values.find((v) => v.labels.game === gameName)?.value ?? 0;
  if (currentValue > 0) {
    activeGamePlayers.labels(gameName).dec();
  }
}
