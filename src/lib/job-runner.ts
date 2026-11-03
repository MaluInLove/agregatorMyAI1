import { getDatabasePool } from "./database.ts";
import { randomUUID } from "node:crypto";
import { spawn } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { getStoragePath } from "./environment.ts";
import { type ModelConfiguration, listModelConfigurations } from "./model-configs.ts";
import { PolzaApiError, PolzaClient } from "./polza.ts";
import { claimNextGenerationJob, recordProviderEvent, type ClaimedGenerationJob } from "./queue.ts";
import { planSafeRetry } from "./retry-policy.ts";
import { chargeAcceptedJob, releaseJobReservation } from "./queue.ts";
import { providerPolicyForTariff, recordMarginCost, type TariffMatch } from "./billing.ts";

export async function runOneQueuedJob(workerInstanceId: string): Promise<boolean> {
  const job = await claimNextGenerationJob(workerInstanceId);
  if (!job) return false;
  const config = (await listModelConfigurations()).find((item) => item.id === job.modelConfigId);
  if (!config || !config.isActive) return fail(job, "MODEL_DISABLED", "Модель выключена до захвата задачи worker.");
  try {
    await recordProviderEvent({ jobId: job.id, eventType: "REQUEST", correlationId: job.correlationId, payload: { model: config.technicalModelId, kind: job.generationKind } });
    const client = new PolzaClient();
    const parameters = object(job.parameters);
    const response = await submit(client, job, config, parameters);
    // A response from create* means Polza accepted the work. Settle the hold before
    // any local result processing so a later download failure cannot refund it.
    await chargeAcceptedJob(job.id);
    const providerJobId = string(response.id);
    const cost = number(object(response.usage).cost_rub) ?? number(object(response.usage).cost);
    await recordProviderEvent({ jobId: job.id, eventType: "RESPONSE", correlationId: job.correlationId, payload: response });
    if (job.generationKind === "VIDEO" && providerJobId) {
      await getDatabasePool().query(`UPDATE generation_jobs SET status='SUBMITTED', provider_job_id=$2, provider_name=$3, submitted_at=CURRENT_TIMESTAMP, lease_token=NULL, lease_expires_at=NULL WHERE id=$1 AND lease_token=$4`, [job.id, providerJobId, config.providerPolicy.only[0] ?? null, job.leaseToken]);
    } else {
      await getDatabasePool().query(`UPDATE generation_jobs SET status='COMPLETED', provider_job_id=$2, provider_name=$3, completed_at=CURRENT_TIMESTAMP, actual_cost=$4::numeric, actual_cost_currency=CASE WHEN $4::numeric IS NULL THEN NULL ELSE 'RUB' END, lease_token=NULL, lease_expires_at=NULL WHERE id=$1 AND lease_token=$5`, [job.id, providerJobId, config.providerPolicy.only[0] ?? null, cost, job.leaseToken]);
    }
    await recordMarginCost(job.id, cost); return true;
  } catch (error) {
    const apiError = error instanceof PolzaApiError ? error : null;
    if (apiError) {
      const retryPlan = planSafeRetry(apiError, job.attemptCount, job.maxAttempts);
      if (retryPlan) return scheduleRetry(job, apiError, retryPlan.nextRetryAt);
    }
    const failed = await fail(job, apiError?.code ?? "WORKER_ERROR", apiError?.message ?? "Ошибка worker при обработке задачи.", apiError?.details);
    if (apiError && apiError.status >= 400) await releaseJobReservation(job.id, "Polza отклонила запрос до принятия.");
    return failed;
  }
}

export async function pollSubmittedVideoJobs(): Promise<void> {
  const result = await getDatabasePool().query<{ id: string; providerJobId: string; correlationId: string }>(
    `SELECT id, provider_job_id AS "providerJobId", correlation_id AS "correlationId" FROM generation_jobs
     WHERE generation_kind='VIDEO' AND status IN ('SUBMITTED','PROCESSING') AND provider_job_id IS NOT NULL ORDER BY submitted_at ASC LIMIT 10`,
  );
  const client = new PolzaClient();
  for (const job of result.rows) {
    try {
      const status = await client.getMediaStatus(job.providerJobId);
      await recordProviderEvent({ jobId: job.id, eventType: "STATUS", correlationId: job.correlationId, payload: status });
      if (status.status === "completed") {
        const data = object(status.data); const url = string(data.url);
        if (!url) throw new Error("Polza завершила видео без URL результата.");
        await saveRemoteVideo(job.id, url);
        const cost = number(status.usage?.cost_rub) ?? number(status.usage?.cost);
        await getDatabasePool().query(`UPDATE generation_jobs SET status='COMPLETED', completed_at=CURRENT_TIMESTAMP, actual_cost=$2::numeric, actual_cost_currency=CASE WHEN $2::numeric IS NULL THEN NULL ELSE 'RUB' END WHERE id=$1`, [job.id, cost]);
        await recordMarginCost(job.id, cost);
      } else if (status.status === "failed") {
        await getDatabasePool().query(`UPDATE generation_jobs SET status='FAILED', failed_at=CURRENT_TIMESTAMP, last_error_code=$2, last_error_message=$3 WHERE id=$1`, [job.id, status.error?.code ?? "POLZA_FAILED", status.error?.message ?? "Polza завершила задачу с ошибкой."]);
      } else await getDatabasePool().query("UPDATE generation_jobs SET status='PROCESSING', processing_started_at=COALESCE(processing_started_at,CURRENT_TIMESTAMP) WHERE id=$1", [job.id]);
    } catch (error) { console.error(`[worker] Status poll failed for ${job.id}: ${error instanceof Error ? error.message : "unknown error"}`); }
  }
}

async function submit(client: PolzaClient, job: ClaimedGenerationJob, config: ModelConfiguration, parameters: Record<string, unknown>): Promise<Record<string, unknown>> {
  const policy = tariffPolicy(job.tariffSnapshot, config.providerPolicy);
  if (job.generationKind === "TEXT") return object(await client.createText({ model: config.technicalModelId, prompt: job.prompt, maxCompletionTokens: numeric(parameters.maxOutputTokens) ?? 256, user: job.correlationId, providerPolicy: policy }));
  if (job.generationKind === "IMAGE") return object(await client.createImage({ model: config.technicalModelId, prompt: job.prompt, parameters, user: job.correlationId, providerPolicy: policy }));
  return object(await client.createMedia({ model: config.technicalModelId, prompt: job.prompt, parameters, user: job.correlationId, providerPolicy: policy }));
}

function tariffPolicy(snapshot: unknown, policy: import("./model-configs.ts").ProviderPolicy) {
  const root = object(snapshot); const maxExternalCost = numeric(root.maxExternalCost);
  if (!maxExternalCost) return policy; // Stage 0 jobs intentionally have no tariff snapshot.
  return providerPolicyForTariff(policy, { id: String(root.tariffVersionId ?? "snapshot"), version: numeric(root.version) ?? 1, creditPrice: numeric(root.creditPrice) ?? 0, currency: String(root.currency ?? "CREDIT"), maxExternalCost, externalCurrency: String(root.externalCurrency ?? "RUB"), parameterKey: object(root.parameters) });
}

async function fail(job: ClaimedGenerationJob, code: string, message: string, details: unknown = {}): Promise<boolean> {
  await recordProviderEvent({ jobId: job.id, eventType: "ERROR", correlationId: job.correlationId, payload: { code, message, details } });
  await getDatabasePool().query(`UPDATE generation_jobs SET status='FAILED', failed_at=CURRENT_TIMESTAMP, last_error_code=$2, last_error_message=$3, last_error_details=$4::jsonb, lease_token=NULL, lease_expires_at=NULL WHERE id=$1 AND lease_token=$5`, [job.id, code, message, JSON.stringify(details), job.leaseToken]);
  return true;
}

async function scheduleRetry(job: ClaimedGenerationJob, error: PolzaApiError, nextRetryAt: Date): Promise<boolean> {
  await recordProviderEvent({
    jobId: job.id,
    eventType: "ERROR",
    correlationId: job.correlationId,
    httpStatus: error.status || undefined,
    payload: { code: error.code, message: error.message, traceId: error.traceId, retryAt: nextRetryAt.toISOString() },
  });
  const result = await getDatabasePool().query(
    `UPDATE generation_jobs
     SET status='QUEUED', available_at=$2, next_retry_at=$2,
         last_error_code=$3, last_error_message=$4, last_error_details=$5::jsonb,
         lease_token=NULL, lease_expires_at=NULL
     WHERE id=$1 AND lease_token=$6`,
    [job.id, nextRetryAt, error.code ?? `HTTP_${error.status}`, error.message, JSON.stringify(error.details), job.leaseToken],
  );
  return result.rowCount === 1;
}
function object(value: unknown): Record<string, unknown> { return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {}; }
function string(value: unknown): string | null { return typeof value === "string" ? value : null; }
function number(value: unknown): number | null { return typeof value === "number" ? value : typeof value === "string" && !Number.isNaN(Number(value)) ? Number(value) : null; }
function numeric(value: unknown): number | null { return number(value); }

async function saveRemoteVideo(jobId: string, url: string): Promise<void> {
  const response = await fetch(url); if (!response.ok) throw new Error(`Не удалось скачать результат Polza: HTTP ${response.status}.`);
  const buffer = Buffer.from(await response.arrayBuffer());
  const storage = getStoragePath(); const sourceKey = path.posix.join("results", `${jobId}.mp4`); const wbKey = path.posix.join("results", `${jobId}-wb.mp4`);
  const sourcePath = path.join(storage, ...sourceKey.split("/")); const wbPath = path.join(storage, ...wbKey.split("/"));
  await mkdir(path.dirname(sourcePath), { recursive: true }); await writeFile(sourcePath, buffer);
  await runFfmpeg(sourcePath, wbPath);
  await getDatabasePool().query(`INSERT INTO media_assets (id,generation_job_id,kind,storage_key,original_filename,mime_type,byte_size,metadata) VALUES ($1,$2,'RESULT',$3,$4,'video/mp4',$5,$6::jsonb) ON CONFLICT (storage_key) DO NOTHING`, [randomUUID(), jobId, sourceKey, `${jobId}.mp4`, buffer.length, JSON.stringify({ source: "polza" })]);
  const wbBytes = (await import("node:fs/promises")).stat(wbPath);
  await getDatabasePool().query(`INSERT INTO media_assets (id,generation_job_id,kind,storage_key,original_filename,mime_type,byte_size,metadata) VALUES ($1,$2,'WB_RESULT',$3,$4,'video/mp4',$5,$6::jsonb) ON CONFLICT (storage_key) DO NOTHING`, [randomUUID(), jobId, wbKey, `${jobId}-wb-810x1080.mp4`, (await wbBytes).size, JSON.stringify({ width: 810, height: 1080, codec: "h264" })]);
}

async function runFfmpeg(input: string, output: string): Promise<void> {
  const binary = process.env.FFMPEG_PATH || "ffmpeg";
  await new Promise<void>((resolve, reject) => { const child = spawn(binary, ["-y", "-i", input, "-vf", "scale=810:1080:force_original_aspect_ratio=decrease,pad=810:1080:(ow-iw)/2:(oh-ih)/2:color=white,setsar=1", "-c:v", "libx264", "-pix_fmt", "yuv420p", "-movflags", "+faststart", "-an", output], { stdio: "ignore" }); child.on("error", reject); child.on("exit", (code) => code === 0 ? resolve() : reject(new Error(`FFmpeg завершился с кодом ${code}.`))); });
}
