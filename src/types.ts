import type {
  CommandInteraction,
  SlashCommandBuilder,
  SlashCommandOptionsOnlyBuilder,
} from "discord.js";

export interface Command {
  data: SlashCommandBuilder | SlashCommandOptionsOnlyBuilder;
  execute: (interaction: CommandInteraction) => Promise<void>;
}

export interface Event {
  name: string;
  once?: boolean;
  // biome-ignore lint/suspicious/noExplicitAny: Event handlers have varying signatures
  execute: (...args: any[]) => void | Promise<void>;
}

export interface EventContext {
  commands: Command[];
}
