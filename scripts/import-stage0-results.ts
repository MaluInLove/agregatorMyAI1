import "dotenv/config";
import { randomUUID } from "node:crypto";
import { closeDatabasePool, getDatabasePool } from "../src/lib/database.ts";

const tests = [
  ["gen_2228206505369407489", "text-deepseek-v4-flash", "TEXT", "COMPLETED", "deepseek/deepseek-v4-flash", "gmicloud/fp8", 0.00018477, null],
  ["gen_2228223987269373953", "text-gpt-5-4-mini", "TEXT", "COMPLETED", "openai/gpt-5.4-mini", "openai/flex", 0.00222516, null],
  ["gen_2228224106825256961", "text-gemini-flash", "TEXT", "FAILED", "google/gemini-3.8-flash", "google-vertex/global/flex", 0, "Polza: failed"],
  ["gen_2228229576537018369", "text-gemini-flash", "TEXT", "FAILED", "google/gemini-3.8-flash", "google-vertex/global/flex", 0, "ERR_CANCELED: Внутренняя ошибка сервера"],
  ["gen_2228621743323746305", "text-gemini-flash", "TEXT", "COMPLETED", "google/gemini-3.8-flash", "google-ai-studio/flex", 0.02429904, null],
  ["gen_2228223473556393985", "image-nano-banana-2-1", "IMAGE", "COMPLETED", "google/gemini-nano-banana-2.1", "mie", 3, null],
  ["gen_2228223825225060353", "image-nano-banana-pro", "IMAGE", "COMPLETED", "google/gemini-3-pro-image-preview", "mie", 13.5, null],
  ["gen_2228223624662880257", "image-gpt-image-sunburst", "IMAGE", "COMPLETED", "openai/gpt-image-2.5-sunburst", "mie", 4, null],
  ["gen_2228222166586494977", "video-seedance-2-mini", "VIDEO", "COMPLETED", "bytedance/seedance-2-mini", "mie", 12.825, null],
  ["gen_2228224485800022017", "video-seedance-2", "VIDEO", "COMPLETED", "bytedance/seedance-2", "mie", 110.7, null],
  ["gen_2228224546149240833", "video-wan-3", "VIDEO", "COMPLETED", "alibaba/wan-3.0", "Alibaba", 47.9405916, null],
  ["gen_2228224604199456769", "video-gemini-omni-flash", "VIDEO", "COMPLETED", "google/gemini-omni-1.1-flash", "mie", 48, null],
] as const;

const pool = getDatabasePool();
for (const [id, configId, kind, status, modelId, provider, cost, error] of tests) {
  await pool.query(`UPDATE model_configs SET technical_model_id = $2, provider_configuration = $3::jsonb,
    allowed_parameters = allowed_parameters || $4::jsonb WHERE id = $1`, [configId, modelId, JSON.stringify({ only: [provider], order: [provider], allowFallbacks: false, maxPrice: {} }), JSON.stringify({ verification: status === "COMPLETED" ? "confirmed" : "blocked" })]);
  await pool.query(`INSERT INTO generation_jobs (id, model_config_id, generation_kind, status, prompt, parameters, correlation_id, idempotency_key, provider_name, provider_job_id, attempt_count, max_attempts, submitted_at, completed_at, failed_at, actual_cost, actual_cost_currency, last_error_message)
    VALUES ($1,$2,$3::"GenerationKind",$4::"GenerationStatus",'Stage 0 import: controlled Polza probe','{}'::jsonb,$5,$6,$7,$1,1,1,CURRENT_TIMESTAMP,CASE WHEN $4='COMPLETED' THEN CURRENT_TIMESTAMP END,CASE WHEN $4='FAILED' THEN CURRENT_TIMESTAMP END,$8,'RUB',$9)
    ON CONFLICT (id) DO NOTHING`, [id, configId, kind, status, randomUUID(), randomUUID(), provider, cost, error]);
}
console.log(`[stage0] Imported ${tests.length} Polza test records.`);
await closeDatabasePool();
