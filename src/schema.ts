import { sql } from "drizzle-orm";
import { integer, text, sqliteTable } from "drizzle-orm/sqlite-core";

export const users = sqliteTable("users", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  display_name: text("display_name"),
  avatar: text("avatar"),
  created_at: integer("created_at", { mode: "timestamp" })
    .notNull()
    .default(sql`(current_timestamp)`),
});

export const games = sqliteTable("games", {
  id: integer("id").primaryKey({ autoIncrement: true }).notNull(),
  user_id: text("user_id")
    .notNull()
    .references(() => users.id),
  name: text("name").notNull(),
  start_time: integer("start_time", { mode: "timestamp" })
    .notNull()
    .default(sql`(current_timestamp)`),
  end_time: integer("end_time", { mode: "timestamp" }),
  created_at: integer("created_at", { mode: "timestamp" })
    .notNull()
    .default(sql`(current_timestamp)`),
});
