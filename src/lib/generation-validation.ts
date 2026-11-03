import type { ModelConfiguration } from "./model-configs.ts";

export function validateGenerationInput(config: ModelConfiguration, prompt: string, parameters: unknown): Record<string, unknown> {
  if (!parameters || typeof parameters !== "object" || Array.isArray(parameters)) throw new Error("Параметры должны быть JSON-объектом.");
  const values = parameters as Record<string, unknown>;
  const maxPromptCharacters = number(config.allowedParameters.maxPromptCharacters);
  if (maxPromptCharacters && prompt.length > maxPromptCharacters) throw new Error(`Промпт длиннее допустимых ${maxPromptCharacters} символов.`);
  if (config.generationKind === "TEXT") return validateText(config, values);
  if (config.generationKind === "VIDEO") return validateVideo(config, values);
  return validateImage(config, values);
}

function validateText(config: ModelConfiguration, values: Record<string, unknown>): Record<string, unknown> {
  rejectUnknown(values, new Set(["maxOutputTokens"]));
  if (values.maxOutputTokens === undefined) return values;
  const requested = number(values.maxOutputTokens); const maximum = number(config.allowedParameters.maxOutputTokens);
  if (!requested || !Number.isInteger(requested) || !maximum || requested > maximum) throw new Error(`maxOutputTokens должен быть целым числом от 1 до ${maximum}.`);
  return values;
}

function validateVideo(config: ModelConfiguration, values: Record<string, unknown>): Record<string, unknown> {
  rejectUnknown(values, new Set(["duration", "resolution", "aspect_ratio", "generate_audio"]));
  assertInAllowed(values.duration, config.allowedParameters.durationSeconds, "duration");
  assertInAllowed(values.resolution, config.allowedParameters.resolution, "resolution");
  assertInAllowed(values.aspect_ratio, config.allowedParameters.aspectRatio, "aspect_ratio");
  if (values.generate_audio !== undefined && values.generate_audio !== config.allowedParameters.generateAudio) throw new Error("generate_audio не соответствует подтверждённой конфигурации модели.");
  return { ...values, ...(values.duration === undefined ? {} : { duration: String(values.duration) }) };
}

function validateImage(config: ModelConfiguration, values: Record<string, unknown>): Record<string, unknown> {
  rejectUnknown(values, new Set(["image_resolution", "aspect_ratio", "output_format"]));
  assertInAllowed(values.image_resolution, config.allowedParameters.imageResolution, "image_resolution");
  assertInAllowed(values.aspect_ratio, config.allowedParameters.aspectRatio, "aspect_ratio");
  if (values.output_format !== undefined && values.output_format !== "jpeg") throw new Error("output_format должен быть jpeg для подтверждённого пресета.");
  return values;
}

function assertInAllowed(value: unknown, allowed: unknown, label: string): void {
  if (value === undefined) return;
  if (!Array.isArray(allowed) || !allowed.some((candidate) => String(candidate) === String(value))) throw new Error(`${label} не разрешён для выбранной модели.`);
}
function rejectUnknown(values: Record<string, unknown>, allowed: Set<string>): void { for (const key of Object.keys(values)) if (!allowed.has(key)) throw new Error(`Параметр ${key} не разрешён для выбранной модели.`); }
function number(value: unknown): number | null { return typeof value === "number" && Number.isFinite(value) ? value : null; }
