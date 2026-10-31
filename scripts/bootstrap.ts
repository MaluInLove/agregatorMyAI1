import { assertDatabaseConnection } from "../src/lib/database";
import { ensureLocalStorage } from "../src/lib/environment";
import path from "node:path";
import { environmentError, runNodeScript } from "./shared";

export async function bootstrap(): Promise<void> {
  try {
    await assertDatabaseConnection();
    console.log("[bootstrap] PostgreSQL connection verified.");
  } catch (error) {
    throw new Error(`[bootstrap] PostgreSQL is unavailable: ${environmentError(error)}`);
  }

  const prismaCli = path.join(process.cwd(), "node_modules", "prisma", "build", "index.js");
  const tsxCli = path.join(process.cwd(), "node_modules", "tsx", "dist", "cli.mjs");

  await runNodeScript(prismaCli, ["migrate", "deploy"]);
  await runNodeScript(prismaCli, ["generate"]);
  await runNodeScript(tsxCli, ["scripts/seed-admin.ts"]);

  const storagePath = await ensureLocalStorage();
  console.log(`[bootstrap] Local storage ready: ${storagePath}`);
}
