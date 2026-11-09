import { getDatabasePool } from "./database.ts";
import { randomUUID } from "node:crypto";
import { spawn } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { getObjectStorage } from "./object-storage.ts";
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
    await recordProviderEvent({ jobId: job.id, eventType: "REQUEST", correlationId: job.correlationId, payload: { model: config.technicalModelId, kind: job.generationKind, parameters: object(job.parameters) } });
    const client = new PolzaClient();
    const parameters = object(job.parameters);
    const response = await submit(client, job, config, parameters);
    // A response from create* means Polza accepted the work. Settle the hold before
    // any local result processing so a later download failure cannot refund it.
    await chargeAcceptedJob(job.id);
    const providerJobId = string(response.id);
    const cost = number(object(response.usage).cost_rub) ?? number(object(response.usage).cost);
    await recordProviderEvent({ jobId: job.id, eventType: "RESPONSE", correlationId: job.correlationId, payload: response });
    if ((job.generationKind === "VIDEO" || usesMediaApi(config)) && providerJobId) {
      await getDatabasePool().query(`UPDATE generation_jobs SET status='SUBMITTED', provider_job_id=$2, provider_name=$3, submitted_at=CURRENT_TIMESTAMP, lease_token=NULL, lease_expires_at=NULL WHERE id=$1 AND lease_token=$4`, [job.id, providerJobId, config.providerPolicy.only[0] ?? null, job.leaseToken]);
      await setChatGenerationState(job.id, "SUBMITTED");
    } else {
      const resultContent = await persistCompletedResponse(job, response);
      if (!resultContent) {
        const message = "Сервис принял запрос, но не передал готовый результат. Повторная отправка отключена, чтобы не создать дубль и повторное списание.";
        await recordProviderEvent({ jobId: job.id, eventType: "ERROR", correlationId: job.correlationId, payload: { code: "EMPTY_PROVIDER_RESPONSE", message } });
        await getDatabasePool().query(`UPDATE generation_jobs SET status='FAILED', provider_job_id=$2, provider_name=$3, failed_at=CURRENT_TIMESTAMP, actual_cost=$4::numeric, actual_cost_currency=CASE WHEN $4::numeric IS NULL THEN NULL ELSE 'RUB' END, last_error_code='EMPTY_PROVIDER_RESPONSE', last_error_message=$5, lease_token=NULL, lease_expires_at=NULL WHERE id=$1 AND lease_token=$6`, [job.id, providerJobId, config.providerPolicy.only[0] ?? null, cost, message, job.leaseToken]);
        await setChatGenerationState(job.id, `[[generation:FAILED:${message}]]`);
        await recordMarginCost(job.id, cost);
        return true;
      }
      await getDatabasePool().query(`UPDATE generation_jobs SET status='COMPLETED', provider_job_id=$2, provider_name=$3, completed_at=CURRENT_TIMESTAMP, actual_cost=$4::numeric, actual_cost_currency=CASE WHEN $4::numeric IS NULL THEN NULL ELSE 'RUB' END, lease_token=NULL, lease_expires_at=NULL WHERE id=$1 AND lease_token=$5`, [job.id, providerJobId, config.providerPolicy.only[0] ?? null, cost, job.leaseToken]);
      await setChatGenerationState(job.id, resultContent);
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
  const result = await getDatabasePool().query<{ id: string; providerJobId: string; correlationId: string; generationKind: "IMAGE" | "VIDEO" }>(
    `SELECT id, generation_kind::text AS "generationKind", provider_job_id AS "providerJobId", correlation_id AS "correlationId" FROM generation_jobs
     WHERE generation_kind IN ('VIDEO','IMAGE') AND status IN ('SUBMITTED','PROCESSING') AND provider_job_id IS NOT NULL ORDER BY submitted_at ASC LIMIT 10`,
  );
  const client = new PolzaClient();
  for (const job of result.rows) {
    try {
      const status = await client.getMediaStatus(job.providerJobId);
      await recordProviderEvent({ jobId: job.id, eventType: "STATUS", correlationId: job.correlationId, payload: status });
      if (status.status === "completed") {
        const data = object(status.data); const url = job.generationKind === "VIDEO" ? string(data.url) : imageUrls(status)[0] ?? null;
        if (!url) throw new Error("Polza завершила задачу без URL результата.");
        if (job.generationKind === "VIDEO") await saveRemoteVideo(job.id, url); else await saveRemoteImage(job.id, url, 1);
        const cost = number(status.usage?.cost_rub) ?? number(status.usage?.cost);
        await getDatabasePool().query(`UPDATE generation_jobs SET status='COMPLETED', completed_at=CURRENT_TIMESTAMP, actual_cost=$2::numeric, actual_cost_currency=CASE WHEN $2::numeric IS NULL THEN NULL ELSE 'RUB' END WHERE id=$1`, [job.id, cost]);
        const assets = await getDatabasePool().query<{ id: string }>(`SELECT id FROM media_assets WHERE generation_job_id=$1 AND kind IN ('RESULT','WB_RESULT') ORDER BY CASE kind WHEN 'RESULT' THEN 0 WHEN 'WB_RESULT' THEN 1 ELSE 2 END, created_at`, [job.id]);
        await setChatGenerationState(job.id, assets.rowCount ? `[[results:${assets.rows.map((asset) => asset.id).join(",")}]]` : "[[generation:COMPLETED]]");
        await recordMarginCost(job.id, cost);
      } else if (status.status === "failed") {
        await getDatabasePool().query(`UPDATE generation_jobs SET status='FAILED', failed_at=CURRENT_TIMESTAMP, last_error_code=$2, last_error_message=$3 WHERE id=$1`, [job.id, status.error?.code ?? "POLZA_FAILED", status.error?.message ?? "Polza завершила задачу с ошибкой."]);
        await setChatGenerationState(job.id, `[[generation:FAILED:${status.error?.message ?? "Ошибка генерации"}]]`);
      } else { await getDatabasePool().query("UPDATE generation_jobs SET status='PROCESSING', processing_started_at=COALESCE(processing_started_at,CURRENT_TIMESTAMP) WHERE id=$1", [job.id]); await setChatGenerationState(job.id, "[[generation:PROCESSING]]"); }
    } catch (error) { console.error(`[worker] Status poll failed for ${job.id}: ${error instanceof Error ? error.message : "unknown error"}`); }
  }
}

async function submit(client: PolzaClient, job: ClaimedGenerationJob, config: ModelConfiguration, parameters: Record<string, unknown>): Promise<Record<string, unknown>> {
  const policy = tariffPolicy(job.tariffSnapshot, config.providerPolicy);
  const { _referenceAssetIds: referenceAssetIds, ...polzaParameters } = parameters;
  if (job.generationKind === "TEXT") return object(await client.createText({ model: config.technicalModelId, prompt: job.prompt, maxCompletionTokens: numeric(polzaParameters.maxOutputTokens) ?? 256, user: job.correlationId, providerPolicy: policy, attachments: await textAttachments(job.userId, referenceAssetIds) }));
  if (job.generationKind === "IMAGE") return usesMediaApi(config) ? object(await client.createMedia({ model: config.technicalModelId, prompt: job.prompt, parameters: polzaParameters, references: await mediaReferences(client, job.userId, referenceAssetIds, job.correlationId), user: job.correlationId, providerPolicy: policy })) : object(await client.createImage({ model: config.technicalModelId, prompt: job.prompt, parameters: polzaParameters, user: job.correlationId, providerPolicy: policy }));
  return object(await client.createMedia({ model: config.technicalModelId, prompt: job.prompt, parameters: polzaParameters, references: await mediaReferences(client, job.userId, referenceAssetIds, job.correlationId), user: job.correlationId, providerPolicy: policy }));
}
function usesMediaApi(config: ModelConfiguration) {
  return [
    "google/gemini-nano-banana-2.1",
    "google/gemini-3-pro-image-preview",
    "openai/gpt-image-2.5-sunburst",
  ].includes(config.technicalModelId);
}

async function mediaReferences(client: PolzaClient, userId: string | null, value: unknown, correlationId: string) {
  const ids = Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
  if (!ids.length) return [];
  if (!userId) throw new Error("Референсы доступны только в пользовательском чате.");
  const files = await getDatabasePool().query<{ id: string; storageKey: string; filename: string | null; mimeType: string }>(`SELECT id,storage_key AS "storageKey",original_filename AS filename,mime_type AS "mimeType" FROM media_assets WHERE user_id=$1 AND kind='REFERENCE' AND deleted_at IS NULL AND id=ANY($2::text[]) ORDER BY array_position($2::text[], id)`, [userId, ids]);
  if (files.rowCount !== ids.length) throw new Error("Один из референсов больше недоступен.");
  const references = [];
  for (const file of files.rows) {
    if (!file.mimeType.startsWith("image/")) throw new Error("Для этой модели можно прикрепить только изображение.");
    const uploaded = object(await client.uploadReference({ buffer: (await getObjectStorage().read(file.storageKey)).body, filename: file.filename ?? "reference", mimeType: file.mimeType, externalUserId: correlationId }));
    const url = string(uploaded.url) ?? string(object(uploaded.data).url);
    if (!url) throw new Error("Polza не вернула временную ссылку на референс.");
    references.push({ type: "url" as const, data: url });
  }
  return references;
}

async function textAttachments(userId: string | null, value: unknown): Promise<Array<{ buffer: Buffer; filename: string; mimeType: "application/pdf" | "image/png" | "image/jpeg" }>> {
  const ids = Array.isArray(value) ? value.filter((item): item is string => typeof item === "string").slice(0, 1) : [];
  if (!ids.length) return [];
  if (!userId) throw new Error("Вложения доступны только в пользовательском чате.");
  const result = await getDatabasePool().query<{ storageKey: string; filename: string | null; mimeType: "application/pdf" | "image/png" | "image/jpeg" }>(`SELECT storage_key AS "storageKey",original_filename AS filename,mime_type AS "mimeType" FROM media_assets WHERE id=$1 AND user_id=$2 AND kind='REFERENCE' AND deleted_at IS NULL`, [ids[0], userId]);
  const asset = result.rows[0];
  if (!asset || !["application/pdf", "image/png", "image/jpeg"].includes(asset.mimeType)) throw new Error("Прикреплённый файл недоступен для ChatGPT.");
  return [{ buffer: (await getObjectStorage().read(asset.storageKey)).body, filename: asset.filename ?? "attachment", mimeType: asset.mimeType }];
}

function tariffPolicy(snapshot: unknown, policy: import("./model-configs.ts").ProviderPolicy) {
  const root = object(snapshot); const maxExternalCost = numeric(root.maxExternalCost);
  if (!maxExternalCost) return policy; // Stage 0 jobs intentionally have no tariff snapshot.
  return providerPolicyForTariff(policy, { id: String(root.tariffVersionId ?? "snapshot"), version: numeric(root.version) ?? 1, creditPrice: numeric(root.creditPrice) ?? 0, currency: String(root.currency ?? "CREDIT"), maxExternalCost, externalCurrency: String(root.externalCurrency ?? "RUB"), parameterKey: object(root.parameters) });
}

async function fail(job: ClaimedGenerationJob, code: string, message: string, details: unknown = {}): Promise<boolean> {
  await recordProviderEvent({ jobId: job.id, eventType: "ERROR", correlationId: job.correlationId, payload: { code, message, details } });
  await getDatabasePool().query(`UPDATE generation_jobs SET status='FAILED', failed_at=CURRENT_TIMESTAMP, last_error_code=$2, last_error_message=$3, last_error_details=$4::jsonb, lease_token=NULL, lease_expires_at=NULL WHERE id=$1 AND lease_token=$5`, [job.id, code, message, JSON.stringify(details), job.leaseToken]);
  await setChatGenerationState(job.id, `[[generation:FAILED:${message}]]`);
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
  const storage = getObjectStorage(); const sourceKey = path.posix.join("results", `${jobId}.mp4`); const wbKey = path.posix.join("results", `${jobId}-wb.mp4`);
  const wbBuffer = await prepareWildberriesVideo(buffer);
  await Promise.all([storage.put(sourceKey, buffer, "video/mp4"), storage.put(wbKey, wbBuffer, "video/mp4")]);
  await getDatabasePool().query(`INSERT INTO media_assets (id,generation_job_id,kind,storage_key,original_filename,mime_type,byte_size,metadata,expires_at) VALUES ($1,$2,'RESULT',$3,$4,'video/mp4',$5,$6::jsonb,CURRENT_TIMESTAMP + INTERVAL '90 days') ON CONFLICT (storage_key) DO NOTHING`, [randomUUID(), jobId, sourceKey, `${jobId}.mp4`, buffer.length, JSON.stringify({ source: "polza" })]);
  await getDatabasePool().query(`INSERT INTO media_assets (id,generation_job_id,kind,storage_key,original_filename,mime_type,byte_size,metadata,expires_at) VALUES ($1,$2,'WB_RESULT',$3,$4,'video/mp4',$5,$6::jsonb,CURRENT_TIMESTAMP + INTERVAL '90 days') ON CONFLICT (storage_key) DO NOTHING`, [randomUUID(), jobId, wbKey, `${jobId}-wb-810x1080.mp4`, wbBuffer.length, JSON.stringify({ width: 810, height: 1080, codec: "h264" })]);
}

async function persistCompletedResponse(job: ClaimedGenerationJob, response: Record<string, unknown>): Promise<string | null> {
  if (job.generationKind === "TEXT") {
    const choices = Array.isArray(response.choices) ? response.choices : [];
    const first = object(choices[0]); const message = object(first.message);
    const content = typeof message.content === "string" && message.content.trim() ? message.content : typeof response.text === "string" && response.text.trim() ? response.text : null;
    return content?.slice(0, 30_000) ?? null;
  }
  const urls = imageUrls(response);
  if (!urls.length) return null;
  const ids: string[] = [];
  for (const [index, url] of urls.entries()) {
    const asset = await saveRemoteImage(job.id, url, index + 1);
    if (asset) ids.push(asset);
  }
  return ids.length ? `[[results:${ids.join(",")}]]` : null;
}
function imageUrls(response: Record<string, unknown>): string[] {
  const data = Array.isArray(response.data) ? response.data : Array.isArray(response.images) ? response.images : [];
  return data.map((item) => { const row = object(item); return typeof row.url === "string" ? row.url : typeof row.image_url === "string" ? row.image_url : null; }).filter((url): url is string => Boolean(url));
}
async function saveRemoteImage(jobId: string, url: string, index: number): Promise<string | null> {
  const response = await fetch(url); if (!response.ok) throw new Error(`Не удалось скачать изображение Polza: HTTP ${response.status}.`);
  const buffer = Buffer.from(await response.arrayBuffer()); const type = response.headers.get("content-type")?.split(";")[0] || "image/jpeg";
  const extension = type === "image/png" ? ".png" : type === "image/webp" ? ".webp" : ".jpg";
  const key = path.posix.join("results", `${jobId}-${index}${extension}`);
  await getObjectStorage().put(key, buffer, type);
  const id = randomUUID();
  await getDatabasePool().query(`INSERT INTO media_assets (id,generation_job_id,kind,storage_key,original_filename,mime_type,byte_size,metadata,expires_at) VALUES ($1,$2,'RESULT',$3,$4,$5,$6,$7::jsonb,CURRENT_TIMESTAMP + INTERVAL '90 days')`, [id, jobId, key, `${jobId}-${index}${extension}`, type, buffer.length, JSON.stringify({ source: "polza" })]);
  return id;
}
async function setChatGenerationState(jobId: string, content: string): Promise<void> { await getDatabasePool().query(`UPDATE chat_messages SET content=$2 WHERE generation_job_id=$1 AND role='ASSISTANT'`, [jobId, content]); }

async function runFfmpeg(input: string, output: string): Promise<void> {
  const binary = process.env.FFMPEG_PATH || "ffmpeg";
  await new Promise<void>((resolve, reject) => { const child = spawn(binary, ["-y", "-i", input, "-vf", "scale=810:1080:force_original_aspect_ratio=decrease,pad=810:1080:(ow-iw)/2:(oh-ih)/2:color=white,setsar=1", "-c:v", "libx264", "-pix_fmt", "yuv420p", "-movflags", "+faststart", "-an", output], { stdio: "ignore" }); child.on("error", reject); child.on("exit", (code) => code === 0 ? resolve() : reject(new Error(`FFmpeg завершился с кодом ${code}.`))); });
}

async function prepareWildberriesVideo(source: Buffer): Promise<Buffer> {
  const directory = await mkdtemp(path.join(tmpdir(), "ai-aggregator-wb-"));
  const input = path.join(directory, "source.mp4"); const output = path.join(directory, "wildberries.mp4");
  try {
    await writeFile(input, source, { flag: "wx" });
    await runFfmpeg(input, output);
    return await readFile(output);
  } finally {
    await rm(directory, { recursive: true, force: true }).catch(() => undefined);
  }
}
