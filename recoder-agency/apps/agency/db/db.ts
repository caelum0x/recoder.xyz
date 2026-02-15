import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import * as schema from "./schema";

const pool = new pg.Pool({
	connectionString: process.env.DATABASE_URL,
});

export const db = drizzle(pool, { schema, logger: false });

export async function closePool() {
	await pool.end();
}

process.once("SIGTERM", async () => {
	await pool.end();
	process.exit(0);
});

process.once("SIGINT", async () => {
	await pool.end();
	process.exit(0);
});
