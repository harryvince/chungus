import { Events, type Client } from "discord.js";
import { getLogger } from "log4js";
import type { Event } from "../types";

const logger = getLogger();

export function init(): Event {
  return {
    name: Events.ClientReady,
    once: true,
    execute: (client: Client<true>) => {
      logger.info(`Ready! Logged in as ${client.user.tag}!`);
    },
  };
}
