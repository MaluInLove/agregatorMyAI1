import "dotenv/config";
import path from "node:path";
import { runNodeScript } from "./shared.ts";

function configureDedicatedTestDatabase(): void {
  const testUrl = process.env.TEST_DATABASE_URL?.trim();
  if (!testUrl) throw new Error("Для интеграционных тестов задайте TEST_DATABASE_URL отдельной базы с суффиксом _test.");
  if (testUrl === process.env.DATABASE_URL?.trim()) throw new Error("TEST_DATABASE_URL не может совпадать с рабочей DATABASE_URL.");
  let databaseName: string;
  try { databaseName = decodeURIComponent(new URL(testUrl).pathname).replace(/^\//, "").split("/")[0] ?? ""; }
  catch { throw new Error("TEST_DATABASE_URL должен быть корректным PostgreSQL URL."); }
  if (!databaseName.endsWith("_test")) throw new Error("Имя тестовой базы в TEST_DATABASE_URL должно оканчиваться на _test.");
  process.env.DATABASE_URL = testUrl;
}

configureDedicatedTestDatabase();
const prismaCli = path.join(process.cwd(), "node_modules", "prisma", "build", "index.js");
await runNodeScript(prismaCli, ["migrate", "deploy"]);
