import * as fs from "node:fs";
import * as path from "node:path";
import {
  ActivityType,
  Client,
  Events,
  GatewayIntentBits,
  REST,
  Routes,
} from "discord.js";
import { and, eq, isNull, sql } from "drizzle-orm";
import { getLogger } from "log4js";
import { db } from "./db";
import {
  activeGamePlayers,
  commandsExecuted,
  gamesEnded,
  gamesStarted,
  httpRequestDuration,
  presenceUpdates,
  register,
} from "./metrics";
import { games, users } from "./schema";

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
  presenceUpdates.inc();

  const user = newPresence.user;
  if (!user) {
    logger.error("User not found in presence update");
    return;
  }

  const [dbUser] = await db.select().from(users).where(eq(users.id, user.id));

  if (!dbUser) {
    await db.insert(users).values({
      id: user.id,
      name: user.username,
      display_name: user.displayName,
      avatar: user.avatarURL(),
    });
  }

  if (dbUser?.display_name !== user.displayName) {
    await db
      .update(users)
      .set({ display_name: user.displayName })
      .where(eq(users.id, user.id));
  }

  const oldGame = oldPresence?.activities.find(
    (a) => a.type === ActivityType.Playing,
  );
  const newGame = newPresence?.activities.find(
    (a) => a.type === ActivityType.Playing,
  );

  if (!oldGame && newGame) {
    logger.info(`New game started: ${newGame.name} - ${user.tag}`);
    gamesStarted.labels(newGame.name).inc();
    activeGamePlayers.labels(newGame.name).inc();
    await db.insert(games).values({
      user_id: user.id,
      name: newGame.name,
    });
  } else if (oldGame && !newGame) {
    logger.info(`Game ended: ${oldGame.name} - ${user.tag}`);
    gamesEnded.labels(oldGame.name).inc();
    const gaugeData = await activeGamePlayers.get();
    const currentValue =
      gaugeData.values.find((v) => v.labels.game === oldGame.name)?.value ?? 0;
    if (currentValue > 0) {
      activeGamePlayers.labels(oldGame.name).dec();
    }
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
  } else if (oldGame && newGame && oldGame.name !== newGame.name) {
    logger.info(
      `Game updated: ${oldGame.name} -> ${newGame.name} - ${user.tag}`,
    );
    gamesEnded.labels(oldGame.name).inc();
    gamesStarted.labels(newGame.name).inc();
    const gaugeDataForSwitch = await activeGamePlayers.get();
    const currentValueForSwitch =
      gaugeDataForSwitch.values.find((v) => v.labels.game === oldGame.name)
        ?.value ?? 0;
    if (currentValueForSwitch > 0) {
      activeGamePlayers.labels(oldGame.name).dec();
    }
    activeGamePlayers.labels(newGame.name).inc();
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

const commands: Array<{ name: string; data: any; execute: any }> = [];
const fullCommands: Array<{ name: string; data: any; execute: any }> = [];
// Grab all the command folders from the commands directory you created earlier
const foldersPath = path.join(__dirname, "commands");
const commandFiles = fs.readdirSync(foldersPath);
for (const file of commandFiles) {
  const command = require(`./commands/${file}`);
  if ("data" in command && "execute" in command) {
    commands.push(command.data.toJSON());
    fullCommands.push(command);
  } else {
    logger.warn(
      `[WARNING] The command at ${file} is missing a required "data" or "execute" property.`,
    );
  }
}

const rest = new REST().setToken(process.env.DISCORD_TOKEN!);

(async () => {
  try {
    logger.info(
      `Started refreshing ${commands.length} application (/) commands.`,
    );
    // The put method is used to fully refresh all commands in the guild with the current set
    const data = await rest.put(
      Routes.applicationGuildCommands(
        process.env.APP_ID!,
        process.env.GUILD_ID!,
      ),
      { body: commands },
    );
    logger.info(
      `Successfully reloaded ${(data as Array<string>).length} application (/) commands.`,
    );
  } catch (error) {
    // And of course, make sure you catch and log any errors!
    logger.error(error);
  }
})();

client.on(Events.InteractionCreate, async (interaction) => {
  if (!interaction.isCommand()) return;

  const command = fullCommands.find(
    (cmd) => cmd.data.name === interaction.commandName,
  );
  if (!command) return;

  try {
    await command.execute(interaction);
    commandsExecuted.labels(interaction.commandName, "success").inc();
  } catch (error) {
    commandsExecuted.labels(interaction.commandName, "error").inc();
    logger.error(error);
    await interaction.reply({
      content: "There was an error while executing this command!",
      ephemeral: true,
    });
  }
});

const _server = Bun.serve({
  port: 3000,
  async fetch(request) {
    const url = new URL(request.url);
    const start = performance.now();

    let response: Response;
    if (url.pathname === "/metrics") {
      const metrics = await register.metrics();
      response = new Response(metrics, {
        headers: { "Content-Type": register.contentType },
      });
    } else if (url.pathname === "/health") {
      response = new Response("OK");
    } else {
      response = new Response("Not Found", { status: 404 });
    }

    const duration = (performance.now() - start) / 1000;
    httpRequestDuration
      .labels(request.method, url.pathname, response.status.toString())
      .observe(duration);

    return response;
  },
});
