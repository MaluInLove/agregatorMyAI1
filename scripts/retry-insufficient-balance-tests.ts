import "dotenv/config";
import { randomUUID } from "node:crypto";
import { closeDatabasePool, getDatabasePool } from "../src/lib/database.ts";
import { pollSubmittedVideoJobs, runOneQueuedJob } from "../src/lib/job-runner.ts";

const pool = getDatabasePool();
const failed = await pool.query<{ id: string; modelConfigId: string }>(`SELECT id, model_config_id AS "modelConfigId" FROM generation_jobs WHERE idempotency_key LIKE 'stage0-final-20261103-%' AND status='FAILED' AND last_error_code='INSUFFICIENT_BALANCE' ORDER BY created_at`);

for (const job of failed.rows) {
  await pool.query(`UPDATE generation_jobs SET status='QUEUED', available_at=CURRENT_TIMESTAMP, next_retry_at=NULL, failed_at=NULL, last_error_code=NULL, last_error_message=NULL, last_error_details=NULL WHERE id=$1`, [job.id]);
  console.log(`[retry] Released ${job.modelConfigId}; waiting for its final status before releasing the next task.`);
  const deadline = Date.now() + 30 * 60_000;
  while (Date.now() < deadline) {
    await runOneQueuedJob(`sequential-retry-${randomUUID()}`);
    await pollSubmittedVideoJobs();
    const status = await pool.query<{ status: string }>("SELECT status::text AS status FROM generation_jobs WHERE id=$1", [job.id]);
    const value = status.rows[0]?.status;
    if (["COMPLETED", "FAILED", "CANCELLED", "BLOCKED", "EXPIRED"].includes(value ?? "")) { console.log(`[retry] ${job.modelConfigId}: ${value}`); break; }
    await new Promise((resolve) => setTimeout(resolve, 2_000));
  }
}
await closeDatabasePool();
