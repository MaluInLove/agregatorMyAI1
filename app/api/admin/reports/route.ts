import { randomUUID } from "node:crypto";
import { getDatabasePool } from "../../../../src/lib/database.ts";
import { isDenied, requireAdmin } from "../../../../src/lib/request-auth.ts";

export const dynamic = "force-dynamic";

type ReportKind = "expenses" | "audit";
type DateFilter = { from?: string; to?: string };

function readFilters(url: URL): DateFilter {
  const valid = (value: string | null) => value && /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : undefined;
  return { from: valid(url.searchParams.get("from")), to: valid(url.searchParams.get("to")) };
}

function csv(rows: Array<Array<string | number | null | undefined>>): string {
  const cell = (value: string | number | null | undefined) => `"${String(value ?? "").replaceAll('"', '""')}"`;
  return `\uFEFF${rows.map((row) => row.map(cell).join(";")).join("\r\n")}\r\n`;
}

function disposition(filename: string): string { return `attachment; filename*=UTF-8''${encodeURIComponent(filename)}`; }

export async function GET(request: Request): Promise<Response> {
  const admin = await requireAdmin(request); if (isDenied(admin)) return admin;
  const url = new URL(request.url); const report = url.searchParams.get("report") as ReportKind | null;
  if (report !== "expenses" && report !== "audit") return Response.json({ error: "Выберите тип отчёта." }, { status: 400 });
  const filters = readFilters(url); const values: string[] = []; const conditions: string[] = [];
  const addDate = (column: string, operator: ">=" | "<", value: string) => { values.push(value); conditions.push(`${column} ${operator} $${values.length}::date`); };
  if (filters.from) addDate(report === "expenses" ? "j.created_at" : "a.created_at", ">=", filters.from);
  if (filters.to) {
    values.push(filters.to);
    conditions.push(`${report === "expenses" ? "j.created_at" : "a.created_at"} < ($${values.length}::date + INTERVAL '1 day')`);
  }
  const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";
  const database = getDatabasePool(); const generatedAt = new Date();
  let content: string; let filename: string; let rowCount: number;
  if (report === "expenses") {
    const result = await database.query<{ createdAt: Date; user: string | null; email: string | null; model: string; kind: string; status: string; credits: string | null; cost: string | null; currency: string | null; error: string | null }>(
      `SELECT j.created_at AS "createdAt",COALESCE(u.display_name,u.email,'Стенд / система') AS user,u.email,c.display_name AS model,j.generation_kind::text AS kind,j.status::text AS status,j.credit_price::text AS credits,j.actual_cost::text AS cost,j.actual_cost_currency AS currency,j.last_error_message AS error
       FROM generation_jobs j LEFT JOIN users u ON u.id=j.user_id JOIN model_configs c ON c.id=j.model_config_id
       ${where} ORDER BY j.created_at DESC LIMIT 50000`, values,
    );
    rowCount = result.rowCount ?? result.rows.length; filename = `расходы-${generatedAt.toISOString().slice(0, 10)}.csv`;
    content = csv([["Создана", "Пользователь", "Email", "Модель", "Тип", "Статус", "Кредиты", "Расход Polza", "Валюта", "Ошибка"], ...result.rows.map((row) => [row.createdAt.toISOString(), row.user, row.email, row.model, row.kind, row.status, row.credits, row.cost, row.currency, row.error])]);
  } else {
    const result = await database.query<{ createdAt: Date; actor: string | null; action: string; targetType: string; targetId: string | null; details: unknown }>(
      `SELECT a.created_at AS "createdAt",COALESCE(u.display_name,u.email,'Система') AS actor,a.action,a.target_type AS "targetType",a.target_id AS "targetId",a.details
       FROM audit_log a LEFT JOIN users u ON u.id=a.actor_user_id
       ${where} ORDER BY a.created_at DESC LIMIT 50000`, values,
    );
    rowCount = result.rowCount ?? result.rows.length; filename = `аудит-${generatedAt.toISOString().slice(0, 10)}.csv`;
    content = csv([["Время", "Кто", "Действие", "Тип объекта", "ID объекта", "Детали"], ...result.rows.map((row) => [row.createdAt.toISOString(), row.actor, row.action, row.targetType, row.targetId, JSON.stringify(row.details ?? {})])]);
  }
  await database.query(
    `INSERT INTO audit_log (id,actor_user_id,action,target_type,target_id,details)
     VALUES ($1,$2,'REPORT_EXPORTED','report',$3,$4::jsonb)`,
    [randomUUID(), admin.id, report, JSON.stringify({ report, from: filters.from ?? null, to: filters.to ?? null, rowCount })],
  );
  return new Response(content, { headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": disposition(filename), "Cache-Control": "no-store" } });
}
