import "dotenv/config";

import { spawnSync } from "node:child_process";
import { assertDatabaseConnection } from "../src/lib/database";
import { environmentError } from "./shared";

function commandIsAvailable(command: string, args: string[]): boolean {
  const result = spawnSync(command, args, { stdio: "ignore" });
  return !result.error && result.status === 0;
}

async function checkEnvironment(): Promise<void> {
  const nodeMajor = Number.parseInt(process.versions.node.split(".")[0] ?? "0", 10);
  const checks = [
    { name: "Node.js 22+", passed: nodeMajor >= 22 },
    { name: "psql in PATH", passed: commandIsAvailable("psql", ["--version"]) },
    { name: "FFmpeg in PATH", passed: commandIsAvailable("ffmpeg", ["-version"]) },
  ];

  for (const check of checks) {
    console.log(`[check:env] ${check.passed ? "OK" : "MISSING"}: ${check.name}`);
  }

  try {
    await assertDatabaseConnection();
    console.log("[check:env] OK: PostgreSQL connection");
  } catch (error) {
    console.log(`[check:env] MISSING: PostgreSQL connection (${environmentError(error)})`);
    process.exitCode = 1;
    return;
  }

  if (checks.some((check) => !check.passed)) {
    process.exitCode = 1;
  }
}

checkEnvironment();
