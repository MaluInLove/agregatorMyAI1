import { getDatabasePool } from "./database.ts";
import type { Viewer } from "./auth.ts";

export interface AdminUserHistory {
  user: { id: string; email: string; displayName: string | null; role: string; isBlocked: boolean; accessEndsAt: string | null; balance: number };
  jobs: Array<{ id: string; createdAt: string; model: string; status: string; prompt: string; actualCost: number | null; error: string | null }>;
}

export async function getAdminUserHistory(actor: Viewer, userId: string): Promise<AdminUserHistory | null> {
  if (actor.role !== "ADMIN") throw new Error("Недостаточно прав.");
  const database = getDatabasePool();
  const [userResult, jobsResult] = await Promise.all([
    database.query<{ id: string; email: string; displayName: string | null; role: string; isBlocked: boolean; accessEndsAt: Date | null; balance: string }>(
      `SELECT u.id,u.email,u.display_name AS "displayName",u.role::text AS role,u.is_blocked AS "isBlocked",
              (SELECT MAX(ends_at) FROM access_periods WHERE user_id=u.id AND status='ACTIVE') AS "accessEndsAt",
              (COALESCE((SELECT SUM(amount) FROM credit_ledger WHERE user_id=u.id),0)-COALESCE((SELECT SUM(amount) FROM credit_reservations WHERE user_id=u.id AND status='HELD'),0))::text AS balance
       FROM users u WHERE u.id=$1`, [userId],
    ),
    database.query<{ id: string; createdAt: Date; model: string; status: string; prompt: string; actualCost: string | null; error: string | null }>(
      `SELECT j.id,j.created_at AS "createdAt",c.display_name AS model,j.status::text AS status,j.prompt,j.actual_cost::text AS "actualCost",j.last_error_message AS error
       FROM generation_jobs j JOIN model_configs c ON c.id=j.model_config_id
       WHERE j.user_id=$1 ORDER BY j.created_at DESC LIMIT 100`, [userId],
    ),
  ]);
  const row = userResult.rows[0];
  if (!row) return null;
  return { user: { ...row, balance: Number(row.balance), accessEndsAt: row.accessEndsAt?.toISOString() ?? null }, jobs: jobsResult.rows.map((job) => ({ ...job, createdAt: job.createdAt.toISOString(), actualCost: job.actualCost === null ? null : Number(job.actualCost) })) };
}
