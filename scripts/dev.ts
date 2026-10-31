import { spawn } from "node:child_process";
import path from "node:path";
import { bootstrap } from "./bootstrap";

async function start(): Promise<void> {
  await bootstrap();

  const nextCli = path.join(process.cwd(), "node_modules", "next", "dist", "bin", "next");
  const tsxCli = path.join(process.cwd(), "node_modules", "tsx", "dist", "cli.mjs");
  const port = process.env.PORT ?? "3000";
  if (!/^\d{1,5}$/.test(port) || Number(port) < 1 || Number(port) > 65535) {
    throw new Error("PORT must be a valid TCP port number.");
  }
  const processes = [
    spawn(process.execPath, [nextCli, "dev", "--hostname", "127.0.0.1", "--port", port], {
      stdio: "inherit",
      env: process.env,
    }),
    spawn(process.execPath, [tsxCli, "src/worker/index.ts"], { stdio: "inherit", env: process.env }),
  ];
  let stopping = false;

  const stopAll = (exitCode: number): void => {
    if (stopping) return;
    stopping = true;
    for (const child of processes) child.kill();
    process.exitCode = exitCode;
  };

  for (const child of processes) {
    child.on("error", (error) => {
      console.error(`[dev] Failed to start a process: ${error.message}`);
      stopAll(1);
    });
    child.on("exit", (code) => {
      if (!stopping) stopAll(code === 0 ? 0 : 1);
    });
  }

  process.on("SIGINT", () => stopAll(0));
  process.on("SIGTERM", () => stopAll(0));
}

start().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : "Bootstrap failed.");
  process.exitCode = 1;
});
