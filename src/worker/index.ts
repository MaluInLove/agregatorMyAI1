import "dotenv/config";
import { randomUUID } from "node:crypto";
import { closeDatabasePool, getDatabasePool } from "../lib/database.ts";
import { pollSubmittedVideoJobs, runOneQueuedJob } from "../lib/job-runner.ts";

let stopping = false;
const instanceId = `worker-${randomUUID()}`;

async function writeHeartbeat(): Promise<void> {
  await getDatabasePool().query(
    `INSERT INTO worker_heartbeats (instance_id, metadata)
     VALUES ($1, $2::jsonb)
     ON CONFLICT (instance_id)
     DO UPDATE SET last_seen_at = CURRENT_TIMESTAMP, metadata = EXCLUDED.metadata`,
    [instanceId, JSON.stringify({ pid: process.pid, stage: "0" })],
  );
}

async function stop(signal: string): Promise<void> {
  if (stopping) {
    return;
  }

  stopping = true;
  await closeDatabasePool().catch(() => undefined);
  console.log(`[worker] ${signal} received; worker stopped safely.`);
  process.exit(0);
}

async function start(): Promise<void> {
  await writeHeartbeat();
  console.log(`[worker] Stage 0 worker ${instanceId} started; heartbeat is active.`);
  setInterval(() => {
    void writeHeartbeat().catch((error: unknown) => {
      console.error(`[worker] Heartbeat failed: ${error instanceof Error ? error.message : "unknown error"}`);
    });
  }, 60_000);
  setInterval(() => {
    void Promise.all([runOneQueuedJob(instanceId), pollSubmittedVideoJobs()]).catch((error: unknown) => console.error(`[worker] Job failed: ${error instanceof Error ? error.message : "unknown error"}`));
  }, 2_000);
}

process.on("SIGINT", () => void stop("SIGINT"));
process.on("SIGTERM", () => void stop("SIGTERM"));

start().catch((error: unknown) => {
  console.error(`[worker] Unable to start: ${error instanceof Error ? error.message : "unknown error"}`);
  process.exitCode = 1;
});
