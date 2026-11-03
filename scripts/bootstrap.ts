import { assertDatabaseConnection } from "../src/lib/database.ts";
import { ensureLocalStorage } from "../src/lib/environment.ts";
import path from "node:path";
import { environmentError, runNodeScript } from "./shared.ts";

export async function bootstrap(): Promise<void> {
  try {
    await assertDatabaseConnection();
    console.log("[bootstrap] PostgreSQL connection verified.");
  } catch (error) {
    throw new Error(`[bootstrap] PostgreSQL is unavailable: ${environmentError(error)}`);
  }

  const prismaCli = path.join(process.cwd(), "node_modules", "prisma", "build", "index.js");

  await runNodeScript(prismaCli, ["migrate", "deploy"]);
  await runNodeScript(prismaCli, ["generate"]);
  await runNodeScript("scripts/seed-admin.ts", []);
  await runNodeScript("scripts/seed-models.ts", []);

  const storagePath = await ensureLocalStorage();
  console.log(`[bootstrap] Local storage ready: ${storagePath}`);
}
