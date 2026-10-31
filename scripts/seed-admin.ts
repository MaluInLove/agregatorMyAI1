import "dotenv/config";

import { randomUUID } from "node:crypto";
import bcrypt from "bcryptjs";
import { Client } from "pg";
import { requireDatabaseUrl } from "../src/lib/database";

async function seedInitialAdministrator(): Promise<void> {
  const email = process.env.INITIAL_ADMIN_EMAIL?.trim().toLowerCase();
  const password = process.env.INITIAL_ADMIN_PASSWORD;

  if (!email || !password) {
    throw new Error("INITIAL_ADMIN_EMAIL and INITIAL_ADMIN_PASSWORD must be set before starting the stand.");
  }

  if (password.length < 12) {
    throw new Error("INITIAL_ADMIN_PASSWORD must contain at least 12 characters.");
  }

  const passwordHash = await bcrypt.hash(password, 12);
  const client = new Client({ connectionString: requireDatabaseUrl() });

  try {
    await client.connect();
    const result = await client.query(
      `INSERT INTO users (id, email, password_hash, role, updated_at)
       VALUES ($1, $2, $3, 'ADMIN', NOW())
       ON CONFLICT (email) DO NOTHING
       RETURNING id`,
      [randomUUID(), email, passwordHash],
    );

    console.log(result.rowCount === 1 ? "[bootstrap] Initial administrator created." : "[bootstrap] Initial administrator already exists.");
  } finally {
    await client.end().catch(() => undefined);
  }
}

seedInitialAdministrator().catch((error: unknown) => {
  console.error(`[bootstrap] Administrator setup failed: ${error instanceof Error ? error.message : "Unknown error"}`);
  process.exitCode = 1;
});
