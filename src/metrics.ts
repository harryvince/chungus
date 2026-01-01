import {
  Counter,
  collectDefaultMetrics,
  Gauge,
  Histogram,
  Registry,
} from "prom-client";

export const register = new Registry();

// Add default metrics (CPU, memory, event loop, etc.)
collectDefaultMetrics({ register });

// Custom metrics
export const commandsExecuted = new Counter({
  name: "discord_commands_executed_total",
  help: "Total number of Discord commands executed",
  labelNames: ["command", "status"] as const,
  registers: [register],
});

export const gamesStarted = new Counter({
  name: "discord_games_started_total",
  help: "Total number of game sessions started",
  labelNames: ["game"] as const,
  registers: [register],
});

export const gamesEnded = new Counter({
  name: "discord_games_ended_total",
  help: "Total number of game sessions ended",
  labelNames: ["game"] as const,
  registers: [register],
});

export const presenceUpdates = new Counter({
  name: "discord_presence_updates_total",
  help: "Total number of presence updates received",
  registers: [register],
});

export const httpRequestDuration = new Histogram({
  name: "http_request_duration_seconds",
  help: "Duration of HTTP requests in seconds",
  labelNames: ["method", "path", "status"] as const,
  buckets: [0.001, 0.005, 0.01, 0.05, 0.1, 0.5, 1],
  registers: [register],
});

export const activeGamePlayers = new Gauge({
  name: "discord_game_active_players",
  help: "Current number of players playing each game",
  labelNames: ["game"] as const,
  registers: [register],
});
