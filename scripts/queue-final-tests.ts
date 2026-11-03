import "dotenv/config";
import { closeDatabasePool, getDatabasePool } from "../src/lib/database.ts";
import { enqueueGenerationJob } from "../src/lib/queue.ts";

const rows = [
  ...["image-nano-banana-2-1", "image-gpt-image-sunburst", "image-nano-banana-pro"].flatMap((modelConfigId) => ["1K", "2K"].flatMap((image_resolution) => ["3:4", "1:1"].map((aspect_ratio) => ({ modelConfigId, kind: "IMAGE" as const, parameters: { image_resolution, aspect_ratio, output_format: "jpeg" }, prompt: "Учебный контрольный тест: предметная товарная съёмка нейтрального продукта на чистом фоне." })))),
  ...["video-seedance-2-mini", "video-seedance-2", "video-wan-3"].flatMap((modelConfigId) => [5, 8].map((duration) => ({ modelConfigId, kind: "VIDEO" as const, parameters: { duration: String(duration), resolution: "720p", aspect_ratio: "3:4", generate_audio: false }, prompt: "Учебный контрольный тест: товар плавно поворачивается на чистом светлом фоне, показать форму и фактуру, без текста." }))),
  { modelConfigId: "text-deepseek-v4-flash", kind: "TEXT" as const, parameters: { maxOutputTokens: 400 }, prompt: "Предложи пять коротких вариантов заголовка для карточки товара: хлопковая футболка." },
  { modelConfigId: "text-deepseek-v4-flash", kind: "TEXT" as const, parameters: { maxOutputTokens: 800 }, prompt: "Напиши описание карточки товара для хлопковой футболки: преимущества, характеристики и пять SEO-фраз." },
  { modelConfigId: "text-deepseek-v4-flash", kind: "TEXT" as const, parameters: { maxOutputTokens: 1600 }, prompt: "Разбери описание карточки хлопковой футболки и предложи структуру, преимущества, возражения покупателей и улучшенные SEO-фразы." },
  { modelConfigId: "text-gpt-5-4-mini", kind: "TEXT" as const, parameters: { maxOutputTokens: 400 }, prompt: "Предложи пять коротких вариантов заголовка для карточки товара: хлопковая футболка." },
  { modelConfigId: "text-gpt-5-4-mini", kind: "TEXT" as const, parameters: { maxOutputTokens: 800 }, prompt: "Напиши описание карточки товара для хлопковой футболки: преимущества, характеристики и пять SEO-фраз." },
  { modelConfigId: "text-gpt-5-4-mini", kind: "TEXT" as const, parameters: { maxOutputTokens: 1600 }, prompt: "Разбери описание карточки хлопковой футболки и предложи структуру, преимущества, возражения покупателей и улучшенные SEO-фразы." },
  { modelConfigId: "text-gemini-flash", kind: "TEXT" as const, parameters: { maxOutputTokens: 400 }, prompt: "Предложи пять коротких вариантов заголовка для карточки товара: хлопковая футболка." },
  { modelConfigId: "text-gemini-flash", kind: "TEXT" as const, parameters: { maxOutputTokens: 800 }, prompt: "Напиши описание карточки товара для хлопковой футболки: преимущества, характеристики и пять SEO-фраз." },
  { modelConfigId: "text-gemini-flash", kind: "TEXT" as const, parameters: { maxOutputTokens: 1600 }, prompt: "Разбери описание карточки хлопковой футболки и предложи структуру, преимущества, возражения покупателей и улучшенные SEO-фразы." },
];

const caps: Record<string, { provider: string; maxPrice: number }> = {
  "image-nano-banana-2-1": { provider: "mie", maxPrice: 5 }, "image-gpt-image-sunburst": { provider: "mie", maxPrice: 8 }, "image-nano-banana-pro": { provider: "mie", maxPrice: 15 },
  "video-seedance-2-mini": { provider: "mie", maxPrice: 50 }, "video-seedance-2": { provider: "mie", maxPrice: 225 }, "video-wan-3": { provider: "Alibaba", maxPrice: 190 },
  "text-deepseek-v4-flash": { provider: "gmicloud/fp8", maxPrice: 1 }, "text-gpt-5-4-mini": { provider: "openai/flex", maxPrice: 1 }, "text-gemini-flash": { provider: "google-ai-studio/flex", maxPrice: 2 },
};
const pool = getDatabasePool();
for (const [id, config] of Object.entries(caps)) await pool.query("UPDATE model_configs SET is_active=true, provider_configuration=$2::jsonb WHERE id=$1", [id, JSON.stringify({ only: [config.provider], order: [config.provider], allowFallbacks: false, maxPrice: { [config.provider]: config.maxPrice } })]);
let queued = 0;
for (const [index, row] of rows.entries()) {
  const idempotencyKey = `stage0-final-20261103-${index + 1}`;
  const exists = await pool.query("SELECT 1 FROM generation_jobs WHERE idempotency_key=$1", [idempotencyKey]);
  if (!exists.rowCount) { await enqueueGenerationJob({ modelConfigId: row.modelConfigId, generationKind: row.kind, prompt: row.prompt, parameters: row.parameters, idempotencyKey, maxAttempts: 3 }); queued += 1; }
}
console.log(`[stage0] queued ${queued} of ${rows.length} approved control tests.`);
await closeDatabasePool();
