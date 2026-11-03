import { createHash, randomUUID } from "node:crypto";
import type { PoolClient } from "pg";
import { getDatabasePool } from "./database.ts";
import type { GenerationKind, ProviderPolicy } from "./model-configs.ts";
import { sanitizeDiagnosticValue } from "./diagnostics.ts";

export interface TariffMatch {
  id: string;
  version: number;
  creditPrice: number;
  currency: string;
  maxExternalCost: number;
  externalCurrency: string;
  parameterKey: Record<string, unknown>;
}

export function canonicalParameters(parameters: unknown): Record<string, unknown> {
  if (!parameters || typeof parameters !== "object" || Array.isArray(parameters)) return {};
  return sortValue(parameters) as Record<string, unknown>;
}

export function parameterHash(parameters: unknown): string {
  return createHash("sha256").update(JSON.stringify(canonicalParameters(parameters))).digest("hex");
}

export async function findActiveTariff(modelConfigId: string, parameters: unknown, client: Pick<PoolClient, "query"> = getDatabasePool()): Promise<TariffMatch | null> {
  const result = await client.query<TariffRow>(
    `SELECT id, version, credit_price::text AS "creditPrice", currency,
            max_external_cost::text AS "maxExternalCost", external_currency AS "externalCurrency", parameter_key AS "parameterKey"
       FROM tariff_versions
      WHERE model_config_id=$1 AND parameter_hash=$2 AND status='ACTIVE'
      LIMIT 1`,
    [modelConfigId, parameterHash(parameters)],
  );
  return result.rows[0] ? fromTariffRow(result.rows[0]) : null;
}

/** Admin-only operation. Retiring is explicit, so historical tariff rows remain immutable. */
export async function createTariffVersion(input: {
  modelConfigId: string; parameters: unknown; creditPrice: number; maxExternalCost: number;
  currency?: string; externalCurrency?: string;
}): Promise<TariffMatch> {
  if (!Number.isFinite(input.creditPrice) || input.creditPrice < 0) throw new Error("Цена тарифа должна быть неотрицательной.");
  if (!Number.isFinite(input.maxExternalCost) || input.maxExternalCost <= 0) throw new Error("Защитный потолок должен быть больше нуля.");
  const key = canonicalParameters(input.parameters); const hash = parameterHash(key); const client = await getDatabasePool().connect();
  try {
    await client.query("BEGIN");
    const current = await client.query<{ version: number }>(`SELECT version FROM tariff_versions WHERE model_config_id=$1 AND parameter_hash=$2 ORDER BY version DESC LIMIT 1 FOR UPDATE`, [input.modelConfigId, hash]);
    await client.query(`UPDATE tariff_versions SET status='RETIRED', retired_at=CURRENT_TIMESTAMP WHERE model_config_id=$1 AND parameter_hash=$2 AND status='ACTIVE'`, [input.modelConfigId, hash]);
    const row = await client.query<TariffRow>(
      `INSERT INTO tariff_versions (id,model_config_id,parameter_key,parameter_hash,version,credit_price,currency,max_external_cost,external_currency)
       VALUES ($1,$2,$3::jsonb,$4,$5,$6,$7,$8,$9)
       RETURNING id,version,credit_price::text AS "creditPrice",currency,max_external_cost::text AS "maxExternalCost",external_currency AS "externalCurrency",parameter_key AS "parameterKey"`,
      [randomUUID(), input.modelConfigId, JSON.stringify(key), hash, (current.rows[0]?.version ?? 0) + 1, input.creditPrice, input.currency ?? "CREDIT", input.maxExternalCost, input.externalCurrency ?? "RUB"],
    );
    await client.query("COMMIT"); return fromTariffRow(row.rows[0]);
  } catch (error) { await client.query("ROLLBACK").catch(() => undefined); throw error; } finally { client.release(); }
}

export async function userHasActiveAccess(client: PoolClient, userId: string): Promise<boolean> {
  const result = await client.query(`SELECT 1 FROM access_periods WHERE user_id=$1 AND status='ACTIVE' AND starts_at<=CURRENT_TIMESTAMP AND ends_at>CURRENT_TIMESTAMP LIMIT 1`, [userId]);
  return result.rowCount === 1;
}

export async function creditBalance(client: PoolClient, userId: string): Promise<number> {
  const result = await client.query<{ balance: string }>(
    `SELECT COALESCE((SELECT SUM(amount) FROM credit_ledger WHERE user_id=$1),0) -
            COALESCE((SELECT SUM(amount) FROM credit_reservations WHERE user_id=$1 AND status='HELD'),0) AS balance`, [userId]);
  return Number(result.rows[0].balance);
}

export async function grantCredits(input: { userId: string; amount: number; reason: string; actorUserId?: string; kind?: "GRANT" | "ADJUSTMENT" | "REFUND" }): Promise<void> {
  if (!Number.isFinite(input.amount) || input.amount <= 0 || !input.reason.trim()) throw new Error("Для начисления нужна положительная сумма и причина.");
  await adjustCredits({ ...input, amount: input.amount, kind: input.kind ?? "ADJUSTMENT" });
}

/** Admin-only adjustment. A reason and an audit row are mandatory for both additions and deductions. */
export async function adjustCredits(input: { userId: string; amount: number; reason: string; actorUserId?: string; kind?: "GRANT" | "ADJUSTMENT" | "DEBIT" | "REFUND" }): Promise<void> {
  if (!Number.isFinite(input.amount) || input.amount === 0 || !input.reason.trim()) throw new Error("Для операции нужна ненулевая сумма и причина.");
  const client = await getDatabasePool().connect();
  try {
    await client.query("BEGIN");
    const user = await client.query(`SELECT id FROM users WHERE id=$1 FOR UPDATE`, [input.userId]);
    if (!user.rowCount) throw new Error("Пользователь не найден.");
    if (input.amount < 0 && await creditBalance(client, input.userId) < Math.abs(input.amount)) throw new Error("Нельзя списать больше доступного баланса.");
    const id = randomUUID();
    await client.query(`INSERT INTO credit_ledger (id,user_id,amount,kind,reason,actor_user_id) VALUES ($1,$2,$3,$4::"CreditLedgerKind",$5,$6)`, [id, input.userId, input.amount, input.kind ?? "ADJUSTMENT", input.reason.trim(), input.actorUserId ?? null]);
    await client.query(`INSERT INTO audit_log (id,actor_user_id,action,target_type,target_id,details) VALUES ($1,$2,'CREDIT_ADJUSTED','credit_ledger',$3,$4::jsonb)`, [randomUUID(), input.actorUserId ?? null, id, JSON.stringify({ userId: input.userId, amount: input.amount, reason: input.reason.trim() })]);
    await client.query("COMMIT");
  } catch (error) { await client.query("ROLLBACK").catch(() => undefined); throw error; } finally { client.release(); }
}

export function providerPolicyForTariff(base: ProviderPolicy, tariff: TariffMatch): ProviderPolicy {
  const provider = base.only[0];
  if (!provider) throw new Error("Для тарифа не задан подтверждённый провайдер.");
  return { ...base, maxPrice: { [provider]: tariff.maxExternalCost } };
}

export async function recordMarginCost(jobId: string, actualCost: number | null): Promise<void> {
  if (actualCost === null || !Number.isFinite(actualCost)) return;
  const result = await getDatabasePool().query<{ ceiling: string }>(`SELECT (tariff_snapshot->>'maxExternalCost')::numeric::text AS ceiling FROM generation_jobs WHERE id=$1`, [jobId]);
  const ceiling = result.rows[0] && Number(result.rows[0].ceiling); if (!ceiling) return;
  if (actualCost < ceiling * 0.85) return;
  await getDatabasePool().query(`INSERT INTO margin_events (id,generation_job_id,level,actual_cost,ceiling,details) VALUES ($1,$2,$3::"MarginEventLevel",$4,$5,$6::jsonb)`, [randomUUID(), jobId, actualCost > ceiling ? "BLOCKED" : "WARNING", actualCost, ceiling, JSON.stringify({ threshold: 0.85 })]);
}

interface TariffRow { id: string; version: number; creditPrice: string; currency: string; maxExternalCost: string; externalCurrency: string; parameterKey: unknown; }
function fromTariffRow(row: TariffRow): TariffMatch { return { ...row, creditPrice: Number(row.creditPrice), maxExternalCost: Number(row.maxExternalCost), parameterKey: canonicalParameters(row.parameterKey) }; }
function sortValue(value: unknown): unknown { if (Array.isArray(value)) return value.map(sortValue); if (value && typeof value === "object") return Object.fromEntries(Object.entries(value as Record<string, unknown>).sort(([a],[b]) => a.localeCompare(b)).map(([key,item]) => [key,sortValue(item)])); return value; }
