import { Client, Pool } from "pg";

let pool: Pool | undefined;

export function requireDatabaseUrl(): string {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    throw new Error("DATABASE_URL is not set. Copy .env.example to .env and fill it in.");
  }

  return databaseUrl;
}

export async function assertDatabaseConnection(): Promise<void> {
  const client = new Client({ connectionString: requireDatabaseUrl() });

  try {
    await client.connect();
    await client.query("SELECT 1");
  } finally {
    await client.end().catch(() => undefined);
  }
}

export function getDatabasePool(): Pool {
  pool ??= new Pool({ connectionString: requireDatabaseUrl(), max: 10 });
  return pool;
}

export async function closeDatabasePool(): Promise<void> {
  if (!pool) return;
  const currentPool = pool;
  pool = undefined;
  await currentPool.end();
}
