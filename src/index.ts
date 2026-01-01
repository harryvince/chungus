import * as fs from "node:fs";
import * as path from "node:path";
import { Client, GatewayIntentBits, REST, Routes } from "discord.js";
import { getLogger } from "log4js";
import { httpRequestDuration, register } from "./metrics";
import type { Command, Event, EventContext } from "./types";

const logger = getLogger();
logger.level = "info";

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildPresences,
  ],
});

// Load commands and events
const commands = loadCommands();
const events = loadEvents({ commands });

// Register events with the client
for (const event of events) {
  if (event.once) {
    client.once(event.name, (...args) => event.execute(...args));
  } else {
    client.on(event.name, (...args) => event.execute(...args));
  }
}

// Start the bot
client.login(process.env.DISCORD_TOKEN);

// Register slash commands with Discord
registerSlashCommands(commands);

// Start HTTP server for metrics and health checks
startHttpServer();

function loadCommands(): Command[] {
  const commands: Command[] = [];
  const commandsPath = path.join(__dirname, "commands");
  const commandFiles = fs.readdirSync(commandsPath);

  for (const file of commandFiles) {
    const command = require(`./commands/${file}`);
    if ("data" in command && "execute" in command) {
      commands.push(command);
    } else {
      logger.warn(
        `[WARNING] The command at ${file} is missing a required "data" or "execute" property.`,
      );
    }
  }

  return commands;
}

function loadEvents(ctx: EventContext): Event[] {
  const events: Event[] = [];
  const eventsPath = path.join(__dirname, "events");
  const eventFiles = fs.readdirSync(eventsPath);

  for (const file of eventFiles) {
    const eventModule = require(`./events/${file}`);
    if ("init" in eventModule) {
      events.push(eventModule.init(ctx));
    } else {
      logger.warn(
        `[WARNING] The event at ${file} is missing a required "init" function.`,
      );
    }
  }

  return events;
}

async function registerSlashCommands(commands: Command[]) {
  const rest = new REST().setToken(process.env.DISCORD_TOKEN!);
  const commandData = commands.map((cmd) => cmd.data.toJSON());

  try {
    logger.info(
      `Started refreshing ${commandData.length} application (/) commands.`,
    );

    const data = await rest.put(
      Routes.applicationGuildCommands(
        process.env.APP_ID!,
        process.env.GUILD_ID!,
      ),
      { body: commandData },
    );

    logger.info(
      `Successfully reloaded ${(data as Array<unknown>).length} application (/) commands.`,
    );
  } catch (error) {
    logger.error(error);
  }
}

function startHttpServer() {
  Bun.serve({
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
}
