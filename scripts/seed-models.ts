import "dotenv/config";
import { closeDatabasePool } from "../src/lib/database.ts";
import { seedInitialModelCandidates } from "../src/lib/model-configs.ts";

seedInitialModelCandidates()
  .then(() => console.log("[bootstrap] Initial model candidates are ready (disabled until verified)."))
  .catch((error: unknown) => {
    console.error(`[bootstrap] Model candidate setup failed: ${error instanceof Error ? error.message : "Unknown error"}`);
    process.exitCode = 1;
  })
  .finally(() => closeDatabasePool());
