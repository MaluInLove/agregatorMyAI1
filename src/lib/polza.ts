import { basename } from "node:path";
import { sanitizeDiagnosticValue } from "./diagnostics.ts";
import type { ProviderPolicy } from "./model-configs.ts";

const API_BASE_URL = "https://polza.ai/api";
// Polza documents a 600-second request limit. Leave a small margin so the
// client does not classify a still-accepted request as an unknown failure.
const DEFAULT_TIMEOUT_MS = 620_000;

export class PolzaApiError extends Error {
  readonly status: number;
  readonly code: string | null;
  readonly traceId: string | null;
  readonly details: unknown;
  readonly retryAfterSeconds: number | null;

  constructor(
    message: string,
    status: number,
    code: string | null,
    traceId: string | null,
    details: unknown,
    retryAfterSeconds: number | null = null,
  ) {
    super(message);
    this.name = "PolzaApiError";
    this.status = status;
    this.code = code;
    this.traceId = traceId;
    this.details = details;
    this.retryAfterSeconds = retryAfterSeconds;
  }
}

export interface PolzaProviderOptions {
  order?: string[];
  only?: string[];
  allow_fallbacks?: boolean;
  max_price?: Record<string, number>;
  require_parameters: true;
}

export interface PolzaMediaReference {
  type: "url" | "file";
  data: string;
}

export interface PolzaMediaStatus {
  id: string;
  status: "pending" | "processing" | "completed" | "failed" | string;
  model?: string;
  data?: unknown;
  usage?: { cost_rub?: number | string; cost?: number | string; [key: string]: unknown };
  error?: { code?: string; message?: string; metadata?: unknown };
  [key: string]: unknown;
}

export class PolzaClient {
  private readonly apiKey: string;
  private readonly timeoutMs: number;

  constructor(
    apiKey = requirePolzaApiKey(),
    timeoutMs = DEFAULT_TIMEOUT_MS,
  ) {
    this.apiKey = apiKey;
    this.timeoutMs = timeoutMs;
  }

  async listModels(type?: "chat" | "image" | "video"): Promise<unknown> {
    const query = new URLSearchParams({ include_providers: "true", include_capabilities: "true" });
    if (type) query.set("type", type);
    return this.requestJson(`/v1/models?${query.toString()}`);
  }

  async createText(input: {
    model: string;
    prompt: string;
    maxCompletionTokens: number;
    user: string;
    providerPolicy: ProviderPolicy;
  }): Promise<unknown> {
    return this.requestJson("/v1/chat/completions", {
      method: "POST",
      body: {
        model: input.model,
        messages: [{ role: "user", content: input.prompt }],
        max_tokens: input.maxCompletionTokens,
        stream: false,
        user: input.user,
        provider: toPolzaProvider(input.providerPolicy),
      },
    });
  }

  async createImage(input: {
    model: string;
    prompt: string;
    parameters: Record<string, unknown>;
    user: string;
    providerPolicy: ProviderPolicy;
  }): Promise<unknown> {
    return this.requestJson("/v2/images/generations", {
      method: "POST",
      body: { model: input.model, prompt: input.prompt, user: input.user, provider: toPolzaProvider(input.providerPolicy), ...input.parameters },
    });
  }

  async createMedia(input: {
    model: string;
    prompt: string;
    parameters: Record<string, unknown>;
    references?: PolzaMediaReference[];
    user: string;
    providerPolicy: ProviderPolicy;
  }): Promise<PolzaMediaStatus> {
    const references = input.references ?? [];
    return this.requestJson<PolzaMediaStatus>("/v1/media", {
      method: "POST",
      body: {
        model: input.model,
        async: true,
        user: input.user,
        provider: toPolzaProvider(input.providerPolicy),
        input: { prompt: input.prompt, images: references, ...input.parameters },
      },
    });
  }

  async getMediaStatus(generationId: string): Promise<PolzaMediaStatus> {
    return this.requestJson<PolzaMediaStatus>(`/v1/media/${encodeURIComponent(generationId)}`);
  }

  async uploadReference(input: { buffer: Buffer; filename: string; mimeType: string; externalUserId: string }): Promise<unknown> {
    const form = new FormData();
    const bytes = new Uint8Array(input.buffer.byteLength);
    bytes.set(input.buffer);
    form.append("file", new Blob([bytes.buffer], { type: input.mimeType }), basename(input.filename));
    form.append("externalUserId", input.externalUserId);
    form.append("storagePolicy", "TEMP_UPLOAD");
    return this.requestJson("/v1/storage/upload", { method: "POST", body: form });
  }

  private async requestJson<T = unknown>(path: string, init: { method?: "POST"; body?: unknown } = {}): Promise<T> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);
    const isForm = init.body instanceof FormData;
    try {
      const response = await fetch(`${API_BASE_URL}${path}`, {
        method: init.method ?? "GET",
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          ...(init.body && !isForm ? { "Content-Type": "application/json" } : {}),
        },
        body: init.body ? (isForm ? init.body as FormData : JSON.stringify(init.body)) : undefined,
        signal: controller.signal,
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw makePolzaApiError(response.status, payload, retryAfterSeconds(response.headers.get("retry-after")));
      return payload as T;
    } catch (error) {
      if (error instanceof PolzaApiError) throw error;
      if (error instanceof Error && error.name === "AbortError") {
        throw new PolzaApiError("Тайм-аут при обращении к Polza.", 0, "CLIENT_TIMEOUT", null, {});
      }
      throw new PolzaApiError("Сетевая ошибка при обращении к Polza.", 0, "NETWORK_ERROR", null, sanitizeDiagnosticValue({ message: error instanceof Error ? error.message : String(error) }));
    } finally {
      clearTimeout(timeout);
    }
  }
}

export function requirePolzaApiKey(): string {
  const apiKey = process.env.POLZA_API_KEY?.trim();
  if (!apiKey) throw new Error("POLZA_API_KEY is not set. Add it to .env before using the Polza adapter.");
  return apiKey;
}

export function toPolzaProvider(policy: ProviderPolicy): PolzaProviderOptions {
  return {
    require_parameters: true,
    allow_fallbacks: policy.allowFallbacks,
    ...(policy.order.length ? { order: policy.order } : {}),
    ...(policy.only.length ? { only: policy.only } : {}),
    ...(Object.keys(policy.maxPrice).length ? { max_price: policy.maxPrice } : {}),
  };
}

function makePolzaApiError(status: number, payload: unknown, retryAfterSeconds: number | null): PolzaApiError {
  const root = payload && typeof payload === "object" ? payload as Record<string, unknown> : {};
  const error = root.error && typeof root.error === "object" ? root.error as Record<string, unknown> : root;
  return new PolzaApiError(
    typeof error.message === "string" ? error.message : `Polza returned HTTP ${status}.`,
    status,
    typeof error.code === "string" ? error.code : null,
    typeof root.trace_id === "string" ? root.trace_id : typeof error.trace_id === "string" ? error.trace_id : null,
    sanitizeDiagnosticValue(payload),
    retryAfterSeconds,
  );
}

function retryAfterSeconds(value: string | null): number | null {
  if (!value) return null;
  const seconds = Number(value);
  return Number.isFinite(seconds) && seconds >= 0 ? Math.ceil(seconds) : null;
}
