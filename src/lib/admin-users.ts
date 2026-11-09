import { randomUUID } from "node:crypto";
import { adjustCredits } from "./billing.ts";
import { getDatabasePool } from "./database.ts";
import type { Viewer } from "./auth.ts";

export interface AdminUser {
  id: string; email: string; displayName: string | null; role: "ADMIN" | "USER" | "GUEST";
  isBlocked: boolean; balance: number; accessEndsAt: string | null;
}

function requireAdmin(actor: Viewer): void { if (actor.role !== "ADMIN") throw new Error("Недостаточно прав."); }

export async function listAdminUsers(actor: Viewer): Promise<AdminUser[]> {
  requireAdmin(actor);
  const result = await getDatabasePool().query<{ id: string; email: string; displayName: string | null; role: AdminUser["role"]; isBlocked: boolean; balance: string; accessEndsAt: Date | null }>(
    `SELECT u.id,u.email,u.display_name AS "displayName",u.role::text AS role,u.is_blocked AS "isBlocked",
            (COALESCE((SELECT SUM(amount) FROM credit_ledger WHERE user_id=u.id),0)-COALESCE((SELECT SUM(amount) FROM credit_reservations WHERE user_id=u.id AND status='HELD'),0))::text AS balance,
            (SELECT MAX(ends_at) FROM access_periods WHERE user_id=u.id AND status='ACTIVE') AS "accessEndsAt"
     FROM users u ORDER BY u.role='ADMIN' DESC,u.created_at DESC`,
  );
  return result.rows.map((row) => ({ ...row, balance: Number(row.balance), accessEndsAt: row.accessEndsAt?.toISOString() ?? null }));
}

export async function adjustUserCredits(actor: Viewer, input: { userId: string; amount: number; reason: string }): Promise<void> {
  requireAdmin(actor);
  if (!Number.isInteger(input.amount) || input.amount === 0 || Math.abs(input.amount) > 100_000) throw new Error("Изменение должно быть целым числом от −100 000 до 100 000, кроме нуля.");
  if (input.reason.trim().length < 3 || input.reason.trim().length > 300) throw new Error("Укажите причину от 3 до 300 символов.");
  await adjustCredits({ userId: input.userId, amount: input.amount, reason: input.reason, actorUserId: actor.id, kind: "ADJUSTMENT" });
}

export async function extendUserAccess(actor: Viewer, input: { userId: string; days: number; credits?: number; reason: string }): Promise<void> {
  requireAdmin(actor);
  if (!Number.isInteger(input.days) || input.days < 1 || input.days > 365) throw new Error("Срок продления — от 1 до 365 дней.");
  const credits = input.credits ?? 0;
  if (!Number.isInteger(credits) || credits < 0 || credits > 100_000) throw new Error("Пакет кредитов — целое число от 0 до 100 000.");
  if (input.reason.trim().length < 3 || input.reason.trim().length > 300) throw new Error("Укажите причину от 3 до 300 символов.");
  const client = await getDatabasePool().connect();
  try {
    await client.query("BEGIN");
    const account = await client.query<{ role: string }>("SELECT role::text AS role FROM users WHERE id=$1 FOR UPDATE", [input.userId]);
    if (!account.rowCount) throw new Error("Пользователь не найден.");
    if (account.rows[0].role === "ADMIN") throw new Error("Администратору срок доступа не продлевается.");
    const prior = await client.query<{ endsAt: Date | null }>("SELECT ends_at AS \"endsAt\" FROM access_periods WHERE user_id=$1 AND status='ACTIVE' ORDER BY ends_at DESC LIMIT 1 FOR UPDATE", [input.userId]);
    const now = new Date(); const base = prior.rows[0]?.endsAt && prior.rows[0].endsAt > now ? prior.rows[0].endsAt : now;
    const endsAt = new Date(base.getTime() + input.days * 86_400_000);
    const accessId = randomUUID();
    await client.query("INSERT INTO access_periods (id,user_id,starts_at,ends_at,status) VALUES ($1,$2,$3,$4,'ACTIVE')", [accessId, input.userId, base, endsAt]);
    if (credits) await client.query("INSERT INTO credit_ledger (id,user_id,amount,kind,reason,actor_user_id,metadata) VALUES ($1,$2,$3,'GRANT',$4,$5,$6::jsonb)", [randomUUID(), input.userId, credits, input.reason.trim(), actor.id, JSON.stringify({ accessPeriodId: accessId, extensionDays: input.days })]);
    await client.query("INSERT INTO audit_log (id,actor_user_id,action,target_type,target_id,details) VALUES ($1,$2,'ACCESS_EXTENDED','access_period',$3,$4::jsonb)", [randomUUID(), actor.id, accessId, JSON.stringify({ userId: input.userId, days: input.days, credits, reason: input.reason.trim(), endsAt: endsAt.toISOString() })]);
    await client.query("COMMIT");
  } catch (error) { await client.query("ROLLBACK").catch(() => undefined); throw error; } finally { client.release(); }
}
