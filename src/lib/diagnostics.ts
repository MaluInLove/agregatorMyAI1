type JsonRecord = Record<string, unknown>;
import { getDatabasePool } from "./database.ts";

const sensitiveKey = /(?:api[-_]?key|authorization|cookie|password|secret|signature|token|credential|access[-_]?key|x-amz-)/i;
const sensitiveQueryParameter = /(?:token|signature|sig|key|credential|password|secret|x-amz-)/i;

function sanitizeString(value: string): string {
  try {
    const url = new URL(value);
    if ([...url.searchParams.keys()].some((key) => sensitiveQueryParameter.test(key))) {
      return `${url.origin}${url.pathname}?redacted`;
    }
  } catch {
    // Values that are not URLs are safe to retain as-is.
  }

  return value;
}

export function sanitizeDiagnosticValue(value: unknown, key = ""): unknown {
  if (sensitiveKey.test(key)) {
    return "[redacted]";
  }

  if (typeof value === "string") {
    return sanitizeString(value);
  }

  if (Array.isArray(value)) {
    return value.map((item) => sanitizeDiagnosticValue(item));
  }

  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as JsonRecord).map(([entryKey, entryValue]) => [
        entryKey,
        sanitizeDiagnosticValue(entryValue, entryKey),
      ]),
    );
  }

  return value;
}

export interface WorkerDiagnostics {
  queue: Record<string, number>;
  workers: Array<{ instanceId: string; lastSeenAt: string; healthy: boolean }>;
}

export async function getWorkerDiagnostics(): Promise<WorkerDiagnostics> {
  const [jobResult, heartbeatResult] = await Promise.all([
    getDatabasePool().query<{ status: string; count: string }>(
      "SELECT status::text, COUNT(*)::text AS count FROM generation_jobs GROUP BY status",
    ),
    getDatabasePool().query<{ instanceId: string; lastSeenAt: Date; healthy: boolean }>(
      `SELECT instance_id AS "instanceId", last_seen_at AS "lastSeenAt",
              last_seen_at >= CURRENT_TIMESTAMP - INTERVAL '3 minutes' AS healthy
       FROM worker_heartbeats
       ORDER BY last_seen_at DESC`,
    ),
  ]);

  return {
    queue: Object.fromEntries(jobResult.rows.map((row) => [row.status, Number(row.count)])),
    workers: heartbeatResult.rows.map((row) => ({
      instanceId: row.instanceId,
      lastSeenAt: row.lastSeenAt.toISOString(),
      healthy: row.healthy,
    })),
  };
}
