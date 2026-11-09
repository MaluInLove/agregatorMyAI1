import "dotenv/config";
import path from "node:path";

const testUrl = process.env.TEST_DATABASE_URL?.trim();
if (!testUrl) throw new Error("TEST_DATABASE_URL не задана. Интеграционные тесты требуют отдельную тестовую БД.");
if (testUrl === process.env.DATABASE_URL?.trim()) throw new Error("TEST_DATABASE_URL не может совпадать с рабочей DATABASE_URL.");
let databaseName: string;
try { databaseName = decodeURIComponent(new URL(testUrl).pathname).replace(/^\//, "").split("/")[0] ?? ""; }
catch { throw new Error("TEST_DATABASE_URL должен быть корректным PostgreSQL URL."); }
if (!databaseName.endsWith("_test")) throw new Error("Имя тестовой базы в TEST_DATABASE_URL должно оканчиваться на _test.");
process.env.DATABASE_URL = testUrl;
// Integration tests must never touch configured S3 storage or real local results.
process.env.OBJECT_STORAGE_DRIVER = "local";
process.env.LOCAL_STORAGE_PATH = path.join("var", "test-storage", `run-${process.pid}`);
