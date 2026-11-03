import { randomUUID } from "node:crypto";
import type { PoolClient } from "pg";
import { getDatabasePool } from "./database.ts";
import { sanitizeDiagnosticValue } from "./diagnostics.ts";

export const JOB_STATUSES = [
  "DRAFT",
  "QUEUED",
  "SUBMITTED",
  "PROCESSING",
  "COMPLETED",
  "FAILED",
  "CANCELLED",
  "BLOCKED",
  "EXPIRED",
] as const;

export type GenerationJobStatus = (typeof JOB_STATUSES)[number];

export interface ClaimedGenerationJob {
  id: string;
  modelConfigId: string;
  correlationId: string;
  idempotencyKey: string;
  leaseToken: string;
  generationKind: "TEXT" | "IMAGE" | "VIDEO";
  prompt: string;
  parameters: unknown;
  attemptCount: number;
  maxAttempts: number;
}

export interface NewGenerationJob {
  id?: string;
  userId?: string;
  modelConfigId: string;
  generationKind: "TEXT" | "IMAGE" | "VIDEO";
  prompt: string;
  parameters?: unknown;
  correlationId?: string;
  idempotencyKey?: string;
  maxAttempts?: number;
  availableAt?: Date;
}

export async function enqueueGenerationJob(input: NewGenerationJob): Promise<{ id: string; correlationId: string }> {
  const id = input.id ?? randomUUID();
  const correlationId = input.correlationId ?? randomUUID();
  const idempotencyKey = input.idempotencyKey ?? randomUUID();
  const result = await getDatabasePool().query<{ id: string }>(
    `INSERT INTO generation_jobs (
      id, user_id, model_config_id, generation_kind, status, prompt, parameters,
      correlation_id, idempotency_key, max_attempts, available_at
    ) VALUES ($1, $2, $3, $4::"GenerationKind", 'QUEUED', $5, $6::jsonb, $7, $8, $9, $10)
    RETURNING id`,
    [
      id,
      input.userId ?? null,
      input.modelConfigId,
      input.generationKind,
      input.prompt,
      JSON.stringify(sanitizeDiagnosticValue(input.parameters ?? {})),
      correlationId,
      idempotencyKey,
      input.maxAttempts ?? 3,
      input.availableAt ?? new Date(),
    ],
  );

  return { id: result.rows[0].id, correlationId };
}

export async function claimNextGenerationJob(
  workerInstanceId: string,
  // Polza documents a request timeout of up to ten minutes.  The lease must
  // outlive that window: otherwise a still-running HTTP call can be claimed
  // by another worker and submitted twice.
  leaseDurationMs = 650_000,
): Promise<ClaimedGenerationJob | null> {
  const client = await getDatabasePool().connect();
  const leaseToken = randomUUID();

  try {
    await client.query("BEGIN");
    const selected = await client.query<{ id: string }>(
      `SELECT id
       FROM generation_jobs
       WHERE status = 'QUEUED'
         AND available_at <= CURRENT_TIMESTAMP
         AND (lease_expires_at IS NULL OR lease_expires_at <= CURRENT_TIMESTAMP)
       ORDER BY available_at ASC, created_at ASC
       FOR UPDATE SKIP LOCKED
       LIMIT 1`,
    );

    if (selected.rowCount === 0) {
      await client.query("COMMIT");
      return null;
    }

    const claimed = await client.query<ClaimedGenerationJob>(
      `UPDATE generation_jobs
       SET lease_token = $2,
           status = 'PROCESSING',
           leased_at = CURRENT_TIMESTAMP,
           lease_expires_at = CURRENT_TIMESTAMP + ($3 * INTERVAL '1 millisecond'),
           worker_instance_id = $4,
           attempt_count = attempt_count + 1,
           last_attempt_at = CURRENT_TIMESTAMP,
           processing_started_at = COALESCE(processing_started_at, CURRENT_TIMESTAMP)
       WHERE id = $1 AND status = 'QUEUED'
       RETURNING id,
                 model_config_id AS "modelConfigId",
                 correlation_id AS "correlationId",
                 idempotency_key AS "idempotencyKey",
                 $2 AS "leaseToken",
                 generation_kind AS "generationKind",
                 prompt,
                 parameters,
                 attempt_count AS "attemptCount",
                 max_attempts AS "maxAttempts"`,
      [selected.rows[0].id, leaseToken, leaseDurationMs, workerInstanceId],
    );
    await client.query("COMMIT");
    return claimed.rows[0] ?? null;
  } catch (error) {
    await rollbackQuietly(client);
    throw error;
  } finally {
    client.release();
  }
}

export async function markJobSubmitted(jobId: string, leaseToken: string): Promise<boolean> {
  const result = await getDatabasePool().query(
    `UPDATE generation_jobs
     SET status = 'SUBMITTED', submitted_at = CURRENT_TIMESTAMP,
         lease_expires_at = NULL, lease_token = NULL
     WHERE id = $1 AND status = 'QUEUED' AND lease_token = $2`,
    [jobId, leaseToken],
  );
  return result.rowCount === 1;
}

export async function cancelQueuedJob(jobId: string): Promise<boolean> {
  const result = await getDatabasePool().query(
    `UPDATE generation_jobs
     SET status = 'CANCELLED', lease_token = NULL, lease_expires_at = NULL
     WHERE id = $1 AND status = 'QUEUED'`,
    [jobId],
  );
  return result.rowCount === 1;
}

export async function recordProviderEvent(input: {
  jobId: string;
  eventType: "REQUEST" | "RESPONSE" | "STATUS" | "ERROR";
  correlationId: string;
  providerName?: string;
  httpStatus?: number;
  payload?: unknown;
}): Promise<void> {
  await getDatabasePool().query(
    `INSERT INTO provider_events (id, generation_job_id, event_type, provider_name, http_status, correlation_id, payload)
     VALUES ($1, $2, $3::"ProviderEventType", $4, $5, $6, $7::jsonb)`,
    [
      randomUUID(),
      input.jobId,
      input.eventType,
      input.providerName ?? null,
      input.httpStatus ?? null,
      input.correlationId,
      JSON.stringify(sanitizeDiagnosticValue(input.payload ?? {})),
    ],
  );
}

async function rollbackQuietly(client: PoolClient): Promise<void> {
  await client.query("ROLLBACK").catch(() => undefined);
}
