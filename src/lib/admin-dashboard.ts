import { getDatabasePool } from "./database.ts";
import { getWorkerDiagnostics } from "./diagnostics.ts";

export interface AdminDashboardData {
  users: { total: number; active: number; blocked: number; guests: number };
  jobs: Record<string, number>;
  costs: { monthRub: number; allRub: number };
  retention: { expiringSoon: number; expired: number };
  workers: Awaited<ReturnType<typeof getWorkerDiagnostics>>["workers"];
  recentJobs: Array<{ id: string; createdAt: string; status: string; model: string; user: string; actualCost: number | null; error: string | null }>;
}

export async function getAdminDashboardData(): Promise<AdminDashboardData> {
  const database = getDatabasePool();
  const [users, jobs, costs, retention, diagnostics, recentJobs] = await Promise.all([
    database.query<{ total: string; active: string; blocked: string; guests: string }>(
      `SELECT COUNT(*)::text AS total,
              COUNT(*) FILTER (WHERE role <> 'ADMIN' AND is_blocked=false AND EXISTS (SELECT 1 FROM access_periods p WHERE p.user_id=users.id AND p.status='ACTIVE' AND p.starts_at<=CURRENT_TIMESTAMP AND p.ends_at>CURRENT_TIMESTAMP))::text AS active,
              COUNT(*) FILTER (WHERE is_blocked)::text AS blocked,
              COUNT(*) FILTER (WHERE role='GUEST')::text AS guests
       FROM users`,
    ),
    database.query<{ status: string; count: string }>("SELECT status::text AS status,COUNT(*)::text AS count FROM generation_jobs GROUP BY status"),
    database.query<{ monthRub: string; allRub: string }>(
      `SELECT COALESCE(SUM(actual_cost) FILTER (WHERE actual_cost_currency='RUB' AND created_at>=date_trunc('month', CURRENT_TIMESTAMP)),0)::text AS "monthRub",
              COALESCE(SUM(actual_cost) FILTER (WHERE actual_cost_currency='RUB'),0)::text AS "allRub"
       FROM generation_jobs`,
    ),
    database.query<{ expiringSoon: string; expired: string }>(
      `SELECT COUNT(*) FILTER (WHERE deleted_at IS NULL AND expires_at>CURRENT_TIMESTAMP AND expires_at<=CURRENT_TIMESTAMP + INTERVAL '7 days')::text AS "expiringSoon",
              COUNT(*) FILTER (WHERE deleted_at IS NOT NULL)::text AS expired
       FROM media_assets`,
    ),
    getWorkerDiagnostics(),
    database.query<{ id: string; createdAt: Date; status: string; model: string; email: string | null; actualCost: string | null; error: string | null }>(
      `SELECT j.id,j.created_at AS "createdAt",j.status::text AS status,c.display_name AS model,u.email,
              j.actual_cost::text AS "actualCost",j.last_error_message AS error
       FROM generation_jobs j JOIN model_configs c ON c.id=j.model_config_id
       LEFT JOIN users u ON u.id=j.user_id
       ORDER BY j.created_at DESC LIMIT 12`,
    ),
  ]);
  const user = users.rows[0] ?? { total: "0", active: "0", blocked: "0", guests: "0" };
  const cost = costs.rows[0] ?? { monthRub: "0", allRub: "0" };
  const files = retention.rows[0] ?? { expiringSoon: "0", expired: "0" };
  return {
    users: Object.fromEntries(Object.entries(user).map(([key, value]) => [key, Number(value)])) as AdminDashboardData["users"],
    jobs: Object.fromEntries(jobs.rows.map((row) => [row.status, Number(row.count)])),
    costs: { monthRub: Number(cost.monthRub), allRub: Number(cost.allRub) },
    retention: { expiringSoon: Number(files.expiringSoon), expired: Number(files.expired) },
    workers: diagnostics.workers,
    recentJobs: recentJobs.rows.map((job) => ({ ...job, createdAt: job.createdAt.toISOString(), user: job.email ?? "Стенд / система", actualCost: job.actualCost === null ? null : Number(job.actualCost) })),
  };
}
