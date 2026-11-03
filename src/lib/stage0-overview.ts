import { getDatabasePool } from "./database.ts";
import { getWorkerDiagnostics } from "./diagnostics.ts";

export interface Stage0JobSummary {
  id: string;
  createdAt: string;
  displayName: string;
  kind: string;
  status: string;
  attemptCount: number;
  actualCost: string | null;
  actualCostCurrency: string | null;
  error: string | null;
  assets: { id: string; kind: "RESULT" | "WB_RESULT" }[];
}

export async function getStage0Overview(): Promise<{ diagnostics: Awaited<ReturnType<typeof getWorkerDiagnostics>>; jobs: Stage0JobSummary[] }> {
  const [diagnostics, result] = await Promise.all([
    getWorkerDiagnostics(),
    getDatabasePool().query<{
      id: string; createdAt: Date; displayName: string; kind: string; status: string;
      attemptCount: number; actualCost: string | null; actualCostCurrency: string | null; error: string | null; assets: { id: string; kind: "RESULT" | "WB_RESULT" }[];
    }>(
      `SELECT j.id, j.created_at AS "createdAt", c.display_name AS "displayName", j.generation_kind::text AS kind,
              j.status::text AS status, j.attempt_count AS "attemptCount", j.actual_cost::text AS "actualCost",
              j.actual_cost_currency AS "actualCostCurrency", j.last_error_message AS error,
              COALESCE((SELECT jsonb_agg(jsonb_build_object('id',a.id,'kind',a.kind::text) ORDER BY a.created_at) FROM media_assets a WHERE a.generation_job_id=j.id AND a.kind IN ('RESULT','WB_RESULT') AND a.deleted_at IS NULL), '[]'::jsonb) AS assets
       FROM generation_jobs j JOIN model_configs c ON c.id = j.model_config_id
       ORDER BY j.created_at DESC LIMIT 50`,
    ),
  ]);
  return { diagnostics, jobs: result.rows.map((row) => ({ ...row, createdAt: row.createdAt.toISOString() })) };
}
