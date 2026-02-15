import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import * as authSchema from "./auth-schema";

const pool = new pg.Pool({
	connectionString: process.env.AUTH_DATABASE_URL,
});

export const authDb = drizzle(pool, { schema: authSchema, logger: false });

export async function closeAuthPool() {
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
