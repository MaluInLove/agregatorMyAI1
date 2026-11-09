import type { PolzaApiError } from "./polza.ts";

export const SAFE_RETRY_HTTP_STATUSES = [408, 429, 500, 502, 503, 504] as const;

export interface RetryPlan {
  nextRetryAt: Date;
  delaySeconds: number;
}

/**
 * Returns a retry plan only for failures which Polza documents as safe to
 * repeat. A missing response is deliberately not retried: the original
 * generation may already have been accepted and Polza has no idempotency key.
 */
export function planSafeRetry(
  error: Pick<PolzaApiError, "status" | "retryAfterSeconds">,
  attemptCount: number,
  maxAttempts: number,
  now = new Date(),
): RetryPlan | null {
  if (!SAFE_RETRY_HTTP_STATUSES.includes(error.status as (typeof SAFE_RETRY_HTTP_STATUSES)[number])) {
    return null;
  }
  if (attemptCount >= maxAttempts) return null;

  const delaySeconds = error.retryAfterSeconds ?? Math.min(2 ** Math.max(0, attemptCount - 1), 30);
  return {
    delaySeconds,
    nextRetryAt: new Date(now.getTime() + delaySeconds * 1_000),
  };
}
