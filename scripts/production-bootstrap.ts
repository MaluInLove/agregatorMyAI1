import { bootstrap } from "./bootstrap.ts";

bootstrap().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : "Bootstrap failed.");
  process.exitCode = 1;
});
