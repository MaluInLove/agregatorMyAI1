import { randomUUID } from "node:crypto";
import type { PoolClient } from "pg";
import { getDatabasePool } from "./database.ts";
import { sanitizeDiagnosticValue } from "./diagnostics.ts";
import { canonicalParameters, creditBalance, findActiveTariff } from "./billing.ts";

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
  tariffSnapshot: unknown;
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

export interface NewUserGenerationJob extends Omit<NewGenerationJob, "userId" | "parameters"> {
  userId: string;
  parameters: Record<string, unknown>;
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

/** Creates the queue item and its credit hold in one database transaction. */
export async function enqueueUserGenerationJob(input: NewUserGenerationJob): Promise<{ id: string; correlationId: string; creditPrice: number }> {
  const id = input.id ?? randomUUID(); const correlationId = input.correlationId ?? randomUUID(); const idempotencyKey = input.idempotencyKey ?? randomUUID();
  const client = await getDatabasePool().connect();
  try {
    await client.query("BEGIN");
    // Serialises balance checks for a user without maintaining a mutable balance column.
    const user = await client.query<{ role: string; isBlocked: boolean }>(`SELECT role::text AS role,is_blocked AS "isBlocked" FROM users WHERE id=$1 FOR UPDATE`, [input.userId]);
    if (user.rowCount !== 1 || user.rows[0].isBlocked) throw new Error("Аккаунт недоступен.");
    const isAdmin = user.rows[0].role === "ADMIN";
    const access = isAdmin ? null : await client.query<{ id: string }>(`SELECT id FROM access_periods WHERE user_id=$1 AND status='ACTIVE' AND starts_at<=CURRENT_TIMESTAMP AND ends_at>CURRENT_TIMESTAMP ORDER BY ends_at DESC LIMIT 1 FOR UPDATE`, [input.userId]);
    const accessId = access?.rows[0]?.id;
    if (!isAdmin && !accessId) throw new Error("Срок доступа закончился. Новые генерации недоступны.");
    const parameters = canonicalParameters(input.parameters);
    const tariff = await findActiveTariff(input.modelConfigId, parameters, client);
    if (!tariff) throw new Error("Для выбранных параметров нет активного тарифа. Генерация не запущена.");
    const isFreeText = tariff.creditPrice === 0 && input.modelConfigId === "text-deepseek-v4-flash";
    if (isFreeText && !isAdmin) {
      const allowance = await client.query<{ totalLimit: number; usedCount: number; dailyLimit: number; dayUsedCount: number; maxExternalBudget: string; reservedExternalBudget: string }>(
        `SELECT total_limit AS "totalLimit",used_count AS "usedCount",daily_limit AS "dailyLimit",day_used_count AS "dayUsedCount",max_external_budget::text AS "maxExternalBudget",reserved_external_budget::text AS "reservedExternalBudget" FROM free_text_allowances WHERE user_id=$1 AND access_period_id=$2 FOR UPDATE`, [input.userId, accessId!]);
      if (!allowance.rowCount) throw new Error("Бесплатный лимит DeepSeek ещё не настроен для этого доступа.");
      const row = allowance.rows[0]; const ceiling = tariff.maxExternalCost;
      if (row.usedCount >= row.totalLimit || row.dayUsedCount >= row.dailyLimit || Number(row.reservedExternalBudget) + ceiling > Number(row.maxExternalBudget)) throw new Error("Бесплатный лимит DeepSeek исчерпан. Выберите GPT-5.4 Mini или Gemini.");
      await client.query(`UPDATE free_text_allowances SET used_count=used_count+1,day_used_count=CASE WHEN day_starts_at=(CURRENT_TIMESTAMP AT TIME ZONE 'Europe/Moscow')::date THEN day_used_count+1 ELSE 1 END,day_starts_at=(CURRENT_TIMESTAMP AT TIME ZONE 'Europe/Moscow')::date,reserved_external_budget=reserved_external_budget+$3 WHERE user_id=$1 AND access_period_id=$2`, [input.userId, accessId!, ceiling]);
    } else if (!isAdmin) {
      const balance = await creditBalance(client, input.userId);
      if (balance < tariff.creditPrice) throw new Error("Недостаточно кредитов для этой генерации.");
    }
    await client.query(
      `INSERT INTO generation_jobs (id,user_id,model_config_id,generation_kind,status,prompt,parameters,correlation_id,idempotency_key,max_attempts,available_at,tariff_version_id,tariff_snapshot,credit_price,credit_currency)
       VALUES ($1,$2,$3,$4::"GenerationKind",'QUEUED',$5,$6::jsonb,$7,$8,$9,$10,$11,$12::jsonb,$13,$14)`,
      [id,input.userId,input.modelConfigId,input.generationKind,input.prompt,JSON.stringify(sanitizeDiagnosticValue(parameters)),correlationId,idempotencyKey,input.maxAttempts ?? 3,input.availableAt ?? new Date(),tariff.id,JSON.stringify({ tariffVersionId: tariff.id, version: tariff.version, parameters, creditPrice: tariff.creditPrice, currency: tariff.currency, maxExternalCost: tariff.maxExternalCost, externalCurrency: tariff.externalCurrency, freeAllowance: isFreeText && !isAdmin, adminNoInternalCharge: isAdmin }),tariff.creditPrice,tariff.currency],
    );
    if (!isAdmin && tariff.creditPrice > 0) await client.query(`INSERT INTO credit_reservations (id,user_id,generation_job_id,amount,reason) VALUES ($1,$2,$3,$4,$5)`, [randomUUID(), input.userId, id, tariff.creditPrice, "Бронь перед отправкой в Polza"]);
    await client.query("COMMIT"); return { id, correlationId, creditPrice: tariff.creditPrice };
  } catch (error) { await rollbackQuietly(client); throw error; } finally { client.release(); }
}

export async function chargeAcceptedJob(jobId: string): Promise<void> {
  const client = await getDatabasePool().connect();
  try {
    await client.query("BEGIN");
    const reservation = await client.query<{ userId: string; amount: string }>(`UPDATE credit_reservations SET status='CHARGED',settled_at=CURRENT_TIMESTAMP WHERE generation_job_id=$1 AND status='HELD' RETURNING user_id AS "userId",amount::text AS amount`, [jobId]);
    if (reservation.rowCount) await client.query(`INSERT INTO credit_ledger (id,user_id,amount,kind,reason,generation_job_id) VALUES ($1,$2,$3,'CHARGE',$4,$5)`, [randomUUID(),reservation.rows[0].userId,-Number(reservation.rows[0].amount),"Polza приняла задачу",jobId]);
    await client.query("COMMIT");
  } catch (error) { await rollbackQuietly(client); throw error; } finally { client.release(); }
}

export async function releaseJobReservation(jobId: string, reason: string): Promise<void> {
  const client = await getDatabasePool().connect();
  try {
    await client.query("BEGIN");
    await client.query(`UPDATE credit_reservations SET status='RELEASED',settled_at=CURRENT_TIMESTAMP,reason=$2 WHERE generation_job_id=$1 AND status='HELD'`, [jobId, reason]);
    const free = await client.query<{ userId: string; ceiling: string }>(`SELECT user_id AS "userId",(tariff_snapshot->>'maxExternalCost')::numeric::text AS ceiling FROM generation_jobs WHERE id=$1 AND tariff_snapshot->>'freeAllowance'='true' FOR UPDATE`, [jobId]);
    if (free.rowCount) await client.query(`UPDATE free_text_allowances SET used_count=GREATEST(used_count-1,0),day_used_count=CASE WHEN day_starts_at=(CURRENT_TIMESTAMP AT TIME ZONE 'Europe/Moscow')::date THEN GREATEST(day_used_count-1,0) ELSE day_used_count END,reserved_external_budget=GREATEST(reserved_external_budget-$2,0) WHERE user_id=$1`, [free.rows[0].userId, free.rows[0].ceiling]);
    await client.query("COMMIT");
  } catch (error) { await rollbackQuietly(client); throw error; } finally { client.release(); }
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
                 max_attempts AS "maxAttempts",
                 tariff_snapshot AS "tariffSnapshot"`,
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
