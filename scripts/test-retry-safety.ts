import { PolzaApiError } from "../src/lib/polza.ts";
import { planSafeRetry } from "../src/lib/retry-policy.ts";
import { sanitizeDiagnosticValue } from "../src/lib/diagnostics.ts";
import { readFile } from "node:fs/promises";

const now = new Date("2026-11-02T10:00:00.000Z");

function error(status: number, code: string, retryAfterSeconds: number | null = null): PolzaApiError {
  return new PolzaApiError(`Mock ${status}`, status, code, null, {}, retryAfterSeconds);
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

const rateLimited = planSafeRetry(error(429, "RATE_LIMITED"), 1, 3, now);
assert(rateLimited, "429 must return a deferred retry plan.");
assert(rateLimited.delaySeconds === 1, "The first retry must wait one second.");
assert(rateLimited.nextRetryAt.toISOString() === "2026-11-02T10:00:01.000Z", "429 retry time is incorrect.");

const unavailable = planSafeRetry(error(503, "TEMPORARILY_UNAVAILABLE", 12), 2, 3, now);
assert(unavailable, "503 must return a deferred retry plan.");
assert(unavailable.delaySeconds === 12, "Retry-After must take precedence over exponential backoff.");
assert(unavailable.nextRetryAt.toISOString() === "2026-11-02T10:00:12.000Z", "503 retry time is incorrect.");

assert(planSafeRetry(error(500, "UPSTREAM_ERROR"), 1, 3, now), "500 must return a deferred retry plan.");
assert(planSafeRetry(error(504, "GATEWAY_TIMEOUT"), 1, 3, now), "504 must return a deferred retry plan.");

assert(planSafeRetry(error(429, "RATE_LIMITED"), 3, 3, now) === null, "A job at its attempt limit must not be retried.");
assert(planSafeRetry(error(0, "NETWORK_ERROR"), 1, 3, now) === null, "An ambiguous network failure must not be retried.");
assert(planSafeRetry(error(0, "CLIENT_TIMEOUT"), 1, 3, now) === null, "An ambiguous client timeout must not be retried.");

const queueSource = await readFile(new URL("../src/lib/queue.ts", import.meta.url), "utf8");
assert(queueSource.includes("status = 'PROCESSING'"), "A claimed job must leave QUEUED before the Polza request starts.");
assert(queueSource.includes("leaseDurationMs = 650_000"), "The worker lease must outlive Polza's documented request window.");
assert(queueSource.includes("JSON.stringify(input.parameters ?? {})"), "Runtime job parameters must retain numeric values for the worker.");
assert(!queueSource.includes("JSON.stringify(sanitizeDiagnosticValue(input.parameters"), "Diagnostic redaction must not overwrite runtime job parameters.");
assert(queueSource.includes('"PAID_AFTER_ALLOWANCE"'), "DeepSeek must have a separate billing tier after its free allowance.");
assert(queueSource.includes("creditPrice = 1"), "DeepSeek after its free allowance must reserve one internal credit.");

const diagnosticParameters = sanitizeDiagnosticValue({ maxOutputTokens: 400, apiKey: "private" }) as Record<string, unknown>;
assert(diagnosticParameters.maxOutputTokens === 400, "Diagnostic output must retain numeric output limits.");
assert(diagnosticParameters.apiKey === "[redacted]", "Diagnostic output must still hide API keys.");

console.log("Retry-safety test passed: retries are safe and runtime parameters preserve their numeric values.");
