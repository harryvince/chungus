import { Events, MessageFlags, type Interaction } from "discord.js";
import { getLogger } from "log4js";
import { commandsExecuted } from "../metrics";
import type { Command, Event, EventContext } from "../types";

const logger = getLogger();

export function init(ctx: EventContext): Event {
  return {
    name: Events.InteractionCreate,
    once: false,
    execute: createExecute(ctx.commands),
  };
}

function createExecute(commands: Command[]) {
  return async (interaction: Interaction) => {
    if (!interaction.isCommand()) return;

    const command = commands.find(
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
        flags: MessageFlags.Ephemeral
      });
    }
  };
}
