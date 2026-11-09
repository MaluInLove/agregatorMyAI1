import assert from "node:assert/strict";
import test from "node:test";
import { sanitizeDiagnosticValue } from "../src/lib/diagnostics.ts";
import { planSafeRetry } from "../src/lib/retry-policy.ts";

const now = new Date("2026-11-02T10:00:00.000Z");
const policyError = (status: number, retryAfterSeconds: number | null = null) => ({ status, retryAfterSeconds });

test("повторяет только явно безопасные ответы Polza", () => {
  for (const status of [408, 429, 500, 502, 503, 504]) {
    assert.ok(planSafeRetry(policyError(status), 1, 3, now), `HTTP ${status} должен допускать повтор`);
  }
  for (const status of [0, 400, 401, 403, 404, 422]) {
    assert.equal(planSafeRetry(policyError(status), 1, 3, now), null, `HTTP ${status} не должен допускать повтор`);
  }
});

test("соблюдает лимит попыток и задержку провайдера", () => {
  assert.equal(planSafeRetry(policyError(429), 3, 3, now), null);
  const retry = planSafeRetry(policyError(503, 12), 2, 3, now);
  assert.deepEqual(retry && { delaySeconds: retry.delaySeconds, nextRetryAt: retry.nextRetryAt.toISOString() }, { delaySeconds: 12, nextRetryAt: "2026-11-02T10:00:12.000Z" });
});

test("не скрывает числовые лимиты при санитарной обработке диагностики", () => {
  const result = sanitizeDiagnosticValue({ maxOutputTokens: 400, apiKey: "private", downloadUrl: "https://files.example/result?signature=private" }) as Record<string, unknown>;
  assert.equal(result.maxOutputTokens, 400);
  assert.equal(result.apiKey, "[redacted]");
  assert.equal(result.downloadUrl, "https://files.example/result?redacted");
});
