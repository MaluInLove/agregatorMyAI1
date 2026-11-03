import { randomUUID } from "node:crypto";
import { getDatabasePool } from "./database.ts";

export type GenerationKind = "TEXT" | "IMAGE" | "VIDEO";

export interface ProviderPolicy {
  order: string[];
  only: string[];
  allowFallbacks: boolean;
  maxPrice: Record<string, number>;
}

export interface ModelConfiguration {
  id: string;
  displayName: string;
  technicalModelId: string;
  generationKind: GenerationKind;
  isActive: boolean;
  allowedParameters: Record<string, unknown>;
  providerPolicy: ProviderPolicy;
  longRunningAfterSeconds: number | null;
}

type ModelConfigRow = Omit<ModelConfiguration, "allowedParameters" | "providerPolicy"> & {
  allowedParameters: unknown;
  providerConfiguration: unknown;
};

export const INITIAL_MODEL_CANDIDATES: readonly ModelConfiguration[] = [
  candidate("image-nano-banana-2-1", "Основная генерация", "candidate/nano-banana-2.1", "IMAGE", {
    imageResolution: ["2K"],
    aspectRatio: ["3:4", "1:1", "16:9"],
    referenceImages: { max: 10, mimeTypes: ["image/png", "image/jpeg", "image/webp"] },
  }),
  candidate("image-nano-banana-pro", "Премиум", "candidate/nano-banana-pro", "IMAGE", {
    imageResolution: ["2K"],
    aspectRatio: ["3:4", "1:1", "16:9"],
    referenceImages: { max: 8, mimeTypes: ["image/png", "image/jpeg", "image/webp"] },
  }),
  candidate("image-gpt-image-sunburst", "GPT Image", "candidate/gpt-image-2.5-sunburst", "IMAGE", {
    aspectRatio: ["3:4", "1:1", "16:9"],
    referenceImages: { max: 16, mimeTypes: ["image/png", "image/jpeg", "image/webp"] },
  }),
  candidate("text-deepseek-v4-flash", "Быстрый", "candidate/deepseek-v4-flash", "TEXT", {
    maxPromptCharacters: 12000,
    maxOutputTokens: 1500,
    dailyLimit: 150,
  }),
  candidate("text-gemini-flash", "Умный", "candidate/gemini-flash", "TEXT", {
    maxPromptCharacters: 24000,
    maxOutputTokens: 3000,
    dailyLimit: 100,
  }),
  candidate("text-gpt-5-4-mini", "Качественный", "candidate/gpt-5.4-mini", "TEXT", {
    maxPromptCharacters: 24000,
    maxOutputTokens: 3000,
    dailyLimit: 75,
  }),
  candidate("video-seedance-2-mini", "Seedance 2 Mini", "candidate/seedance-2-mini", "VIDEO", {
    aspectRatio: ["3:4"],
    resolution: ["480p", "720p"],
    durationSeconds: [4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15],
    generateAudio: false,
  }, 600),
  candidate("video-seedance-2", "Seedance 2", "candidate/seedance-2", "VIDEO", {
    aspectRatio: ["3:4"],
    resolution: ["720p", "1080p"],
    durationSeconds: [4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15],
    generateAudio: false,
  }, 900),
  candidate("video-wan-3", "Wan 3.0", "candidate/wan-3.0", "VIDEO", {
    aspectRatio: ["3:4"],
    resolution: ["720p", "1080p"],
    durationSeconds: Array.from({ length: 29 }, (_, index) => index + 2),
    generateAudio: false,
  }, 1200),
  candidate("video-gemini-omni-flash", "Gemini Omni 1.1 Flash", "candidate/gemini-omni-1.1-flash", "VIDEO", {
    aspectRatio: ["9:16", "16:9"],
    generateAudio: false,
    referenceImages: { max: 2, mimeTypes: ["image/png", "image/jpeg", "image/webp"] },
  }, 1200),
] as const;

function candidate(
  id: string,
  displayName: string,
  technicalModelId: string,
  generationKind: GenerationKind,
  allowedParameters: Record<string, unknown>,
  longRunningAfterSeconds: number | null = null,
): ModelConfiguration {
  return {
    id,
    displayName,
    technicalModelId,
    generationKind,
    isActive: false,
    allowedParameters: { ...allowedParameters, verification: "unverified" },
    providerPolicy: { order: [], only: [], allowFallbacks: false, maxPrice: {} },
    longRunningAfterSeconds,
  };
}

export async function seedInitialModelCandidates(): Promise<void> {
  const pool = getDatabasePool();
  for (const candidateConfig of INITIAL_MODEL_CANDIDATES) {
    await pool.query(
      `INSERT INTO model_configs (
        id, display_name, technical_model_id, generation_kind, is_active,
        allowed_parameters, provider_configuration, long_running_after_seconds
      ) VALUES ($1, $2, $3, $4::"GenerationKind", $5, $6::jsonb, $7::jsonb, $8)
      ON CONFLICT (id) DO NOTHING`,
      [
        candidateConfig.id,
        candidateConfig.displayName,
        candidateConfig.technicalModelId,
        candidateConfig.generationKind,
        candidateConfig.isActive,
        JSON.stringify(candidateConfig.allowedParameters),
        JSON.stringify(candidateConfig.providerPolicy),
        candidateConfig.longRunningAfterSeconds,
      ],
    );
  }
}

export async function listModelConfigurations(): Promise<ModelConfiguration[]> {
  const result = await getDatabasePool().query<ModelConfigRow>(
    `SELECT id, display_name AS "displayName", technical_model_id AS "technicalModelId",
            generation_kind AS "generationKind", is_active AS "isActive",
            allowed_parameters AS "allowedParameters", provider_configuration AS "providerConfiguration",
            long_running_after_seconds AS "longRunningAfterSeconds"
     FROM model_configs ORDER BY generation_kind, display_name`,
  );
  return result.rows.map(fromRow);
}

export async function setModelConfiguration(input: ModelConfiguration): Promise<void> {
  assertActivatable(input);
  await getDatabasePool().query(
    `UPDATE model_configs
     SET display_name = $2, technical_model_id = $3, generation_kind = $4::"GenerationKind",
         is_active = $5, allowed_parameters = $6::jsonb, provider_configuration = $7::jsonb,
         long_running_after_seconds = $8
     WHERE id = $1`,
    [
      input.id,
      input.displayName,
      input.technicalModelId,
      input.generationKind,
      input.isActive,
      JSON.stringify(input.allowedParameters),
      JSON.stringify(input.providerPolicy),
      input.longRunningAfterSeconds,
    ],
  );
}

export async function addModelConfiguration(input: Omit<ModelConfiguration, "id">): Promise<string> {
  assertActivatable(input);
  const id = randomUUID();
  await getDatabasePool().query(
    `INSERT INTO model_configs (
      id, display_name, technical_model_id, generation_kind, is_active,
      allowed_parameters, provider_configuration, long_running_after_seconds
    ) VALUES ($1, $2, $3, $4::"GenerationKind", $5, $6::jsonb, $7::jsonb, $8)`,
    [id, input.displayName, input.technicalModelId, input.generationKind, input.isActive,
      JSON.stringify(input.allowedParameters), JSON.stringify(input.providerPolicy), input.longRunningAfterSeconds],
  );
  return id;
}

function fromRow(row: ModelConfigRow): ModelConfiguration {
  return {
    ...row,
    allowedParameters: objectOrEmpty(row.allowedParameters),
    providerPolicy: providerPolicyOrDefault(row.providerConfiguration),
  };
}

function objectOrEmpty(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function providerPolicyOrDefault(value: unknown): ProviderPolicy {
  const config = objectOrEmpty(value);
  return {
    order: stringArray(config.order),
    only: stringArray(config.only),
    allowFallbacks: config.allowFallbacks === true,
    maxPrice: numericRecord(config.maxPrice),
  };
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

function numericRecord(value: unknown): Record<string, number> {
  return Object.entries(objectOrEmpty(value)).reduce<Record<string, number>>((result, [key, item]) => {
    if (typeof item === "number") result[key] = item;
    return result;
  }, {});
}

function assertActivatable(input: Pick<ModelConfiguration, "isActive" | "technicalModelId" | "providerPolicy">): void {
  if (!input.isActive) return;
  if (!input.technicalModelId.trim() || input.technicalModelId.startsWith("candidate/")) {
    throw new Error("Перед включением модели укажите подтверждённый технический ID Polza.");
  }
  if (input.providerPolicy.only.length === 0) {
    throw new Error("Перед включением модели задайте хотя бы одного разрешённого провайдера.");
  }
}
