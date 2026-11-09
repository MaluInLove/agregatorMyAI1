import { randomUUID } from "node:crypto";
import { getDatabasePool } from "./database.ts";
import { findActiveTariff } from "./billing.ts";
import { listModelConfigurations, type ModelConfiguration } from "./model-configs.ts";
import { validateGenerationInput } from "./generation-validation.ts";
import { enqueueUserGenerationJob, cancelQueuedJob, releaseJobReservation } from "./queue.ts";
import { validateTextAttachmentPolicy } from "./text-attachment-policy.ts";

export type WorkspaceGenerationRequest = { chatId: string; modelConfigId: string; prompt: string; parameters: unknown; referenceAssetIds?: unknown };

export async function workspaceGenerationOptions(userId: string): Promise<{ models: Array<{ id: string; displayName: string; generationKind: string; allowedParameters: Record<string, unknown>; tariffs: Array<{ parameters: Record<string, unknown>; creditPrice: number; currency: string }> }>; deepSeekAllowance: { dailyRemaining: number; dailyLimit: number; totalRemaining: number; totalLimit: number } | null }> {
  const configs = await listModelConfigurations();
  const db = getDatabasePool();
  const [user, allowance, models] = await Promise.all([
    db.query<{ role: string }>(`SELECT role::text AS role FROM users WHERE id=$1`, [userId]),
    db.query<{ totalLimit: number; usedCount: number; dailyLimit: number; dayUsedCount: number }>(`SELECT total_limit AS "totalLimit",used_count AS "usedCount",daily_limit AS "dailyLimit",CASE WHEN day_starts_at=(CURRENT_TIMESTAMP AT TIME ZONE 'Europe/Moscow')::date THEN day_used_count ELSE 0 END AS "dayUsedCount" FROM free_text_allowances WHERE user_id=$1`, [userId]),
    Promise.all(configs.filter((config) => config.isActive).map(async (config) => {
    const tariffs = await db.query<{ parameters: unknown; creditPrice: string; currency: string }>(
      `SELECT parameter_key AS parameters,credit_price::text AS "creditPrice",currency FROM tariff_versions WHERE model_config_id=$1 AND status='ACTIVE' ORDER BY credit_price ASC`, [config.id]);
    return { id: config.id, displayName: config.displayName, generationKind: config.generationKind, allowedParameters: config.allowedParameters, tariffs: tariffs.rows.map((tariff) => ({ parameters: object(tariff.parameters), creditPrice: Number(tariff.creditPrice), currency: tariff.currency })) };
    })),
  ]);
  const row = allowance.rows[0];
  const deepSeekAllowance = user.rows[0]?.role === "ADMIN" || !row ? null : { dailyRemaining: Math.max(0, row.dailyLimit - row.dayUsedCount), dailyLimit: row.dailyLimit, totalRemaining: Math.max(0, row.totalLimit - row.usedCount), totalLimit: row.totalLimit };
  return { models, deepSeekAllowance };
}

export async function createWorkspaceGeneration(userId: string, input: WorkspaceGenerationRequest) {
  if (!input.prompt?.trim()) throw new Error("Сначала напишите промпт.");
  const config = (await listModelConfigurations()).find((item) => item.id === input.modelConfigId);
  if (!config?.isActive) throw new Error("Выбранная модель сейчас недоступна.");
  const prompt = input.prompt.trim().slice(0, 24_000);
  const parameters = validateGenerationInput(config, prompt, input.parameters ?? {});
  const referenceIds = validIds(input.referenceAssetIds);
  await validateChatAndReferences(userId, input.chatId, config, referenceIds, parameters);
  const tariff = await findActiveTariff(config.id, parameters);
  if (!tariff) throw new Error("Для выбранных параметров нет активного тарифа. Генерация не запущена.");
  const job = await enqueueUserGenerationJob({ userId, modelConfigId: config.id, generationKind: config.generationKind, prompt, parameters, referenceAssetIds: referenceIds });
  const content = referenceIds.length ? `${prompt}\n\n[[references:${referenceIds.join(",")}]]` : prompt;
  const db = getDatabasePool();
  await db.query(`UPDATE chats SET title=$3,updated_at=CURRENT_TIMESTAMP WHERE id=$1 AND user_id=$2 AND deleted_at IS NULL AND title='Новый чат' AND NOT EXISTS (SELECT 1 FROM chat_messages WHERE chat_id=$1)`, [input.chatId, userId, chatTitle(prompt)]);
  await db.query(`INSERT INTO chat_messages (id,chat_id,user_id,role,content,generation_job_id) VALUES ($1,$2,$3,'USER',$4,$5)`, [randomUUID(), input.chatId, userId, content, job.id]);
  await db.query(`INSERT INTO chat_messages (id,chat_id,user_id,role,content,generation_job_id) VALUES ($1,$2,$3,'ASSISTANT',$4,$5)`, [randomUUID(), input.chatId, userId, "[[generation:QUEUED]]", job.id]);
  await db.query(`UPDATE chats SET updated_at=CURRENT_TIMESTAMP WHERE id=$1`, [input.chatId]);
  return { ...job, status: "QUEUED" as const };
}

export async function cancelWorkspaceGeneration(userId: string, jobId: string): Promise<void> {
  const row = await getDatabasePool().query(`SELECT id FROM generation_jobs WHERE id=$1 AND user_id=$2`, [jobId, userId]);
  if (!row.rowCount) throw new Error("Задача не найдена.");
  if (!await cancelQueuedJob(jobId)) throw new Error("Отменить можно только задачу, которую worker ещё не начал обрабатывать.");
  await getDatabasePool().query(`UPDATE chat_messages SET content='[[generation:CANCELLED]]' WHERE generation_job_id=$1 AND role='ASSISTANT'`, [jobId]);
  await releaseJobReservation(jobId, "Отменено пользователем до захвата worker");
}

async function validateChatAndReferences(userId: string, chatId: string, config: ModelConfiguration, referenceIds: string[], parameters: Record<string, unknown>) {
  const db = getDatabasePool();
  const chat = await db.query<{ workspaceKind: string }>(`SELECT workspace_kind AS "workspaceKind" FROM chats WHERE id=$1 AND user_id=$2 AND deleted_at IS NULL`, [chatId, userId]);
  if (!chat.rowCount) throw new Error("Чат не найден.");
  const workspaceKind = chat.rows[0].workspaceKind;
  if (workspaceKind !== config.generationKind && !(workspaceKind === "PREMIUM" && config.generationKind === "VIDEO")) throw new Error("Тип чата не соответствует выбранной модели.");
  if (config.id === "video-seedance-2") {
    const duration = String(parameters.duration ?? "");
    const resolution = String(parameters.resolution ?? "");
    if (workspaceKind === "VIDEO" && !(duration === "5" || duration === "8" && resolution === "480p")) throw new Error("В обычном разделе Seedance 2: 5 сек. в 480p или 720p, либо 8 сек. только в 480p.");
    if (workspaceKind === "PREMIUM" && !(duration === "8" && resolution === "720p")) throw new Error("Премиум-пресет Seedance 2 доступен только на 8 секунд в 720p.");
  }
  if (!referenceIds.length) return;
  if (config.generationKind === "TEXT") {
    validateTextAttachmentPolicy(config.id, referenceIds.length);
    const files = await db.query<{ id: string; mimeType: string }>(`SELECT id,mime_type AS "mimeType" FROM media_assets WHERE user_id=$1 AND kind='REFERENCE' AND deleted_at IS NULL AND id=ANY($2::text[])`, [userId, referenceIds]);
    if (files.rowCount !== referenceIds.length) throw new Error("Прикреплённый файл больше недоступен.");
    validateTextAttachmentPolicy(config.id, referenceIds.length, files.rows.map((file) => file.mimeType));
    return;
  }
  const rule = object(config.allowedParameters.referenceImages); const maximum = typeof rule.max === "number" ? rule.max : 0;
  if (!maximum || referenceIds.length > maximum) throw new Error("Количество референсов превышает лимит модели.");
  const files = await db.query<{ id: string; mimeType: string }>(`SELECT id,mime_type AS "mimeType" FROM media_assets WHERE user_id=$1 AND kind='REFERENCE' AND deleted_at IS NULL AND id=ANY($2::text[])`, [userId, referenceIds]);
  if (files.rowCount !== referenceIds.length) throw new Error("Один из референсов больше недоступен.");
  const types = Array.isArray(rule.mimeTypes) ? rule.mimeTypes : [];
  if (types.length && files.rows.some((file) => !types.includes(file.mimeType))) throw new Error("Формат референса не поддерживается выбранной моделью.");
}
function validIds(value: unknown): string[] { return Array.isArray(value) ? [...new Set(value.filter((item): item is string => typeof item === "string" && /^[a-zA-Z0-9-]{8,80}$/.test(item)))].slice(0, 16) : []; }
function object(value: unknown): Record<string, unknown> { return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {}; }
function chatTitle(prompt: string): string { return prompt.replace(/\s+/g, " ").trim().slice(0, 80); }
