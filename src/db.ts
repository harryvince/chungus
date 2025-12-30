import { drizzle } from "drizzle-orm/bun-sqlite";
import { Database } from "bun:sqlite";
import * as schema from "./schema";

const sqlite = new Database("data/data.db");
sqlite.run('PRAGMA journal_mode = WAL;')
export const db = drizzle({ client: sqlite, schema });
