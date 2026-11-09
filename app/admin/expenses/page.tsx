import Link from "next/link";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { SESSION_COOKIE, viewerFromToken } from "../../../src/lib/auth.ts";
import { getDatabasePool } from "../../../src/lib/database.ts";
import { AdminNav } from "../admin-nav";

export const dynamic = "force-dynamic";
const statuses = ["QUEUED", "SUBMITTED", "PROCESSING", "COMPLETED", "FAILED", "CANCELLED"] as const;
const statusLabels: Record<string, string> = { QUEUED: "В очереди", SUBMITTED: "Отправлено", PROCESSING: "В работе", COMPLETED: "Готово", FAILED: "Ошибка", CANCELLED: "Отменено" };
const money = new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 4 });
type Query = { from?: string; to?: string; user?: string; model?: string; status?: string };

export default async function Page({ searchParams }: { searchParams: Promise<Query> }) {
  const viewer = await viewerFromToken((await cookies()).get(SESSION_COOKIE)?.value);
  if (!viewer || viewer.role !== "ADMIN") redirect("/login");
  const filters = await searchParams; const db = getDatabasePool(); const values: unknown[] = []; const where: string[] = [];
  const add = (sql: string, value: unknown) => { values.push(value); where.push(sql.replace("?", `$${values.length}`)); };
  if (filters.from && /^\d{4}-\d{2}-\d{2}$/.test(filters.from)) add("j.created_at >= ?::date", filters.from);
  if (filters.to && /^\d{4}-\d{2}-\d{2}$/.test(filters.to)) add("j.created_at < (?::date + INTERVAL '1 day')", filters.to);
  if (filters.user) add("j.user_id = ?", filters.user);
  if (filters.model) add("j.model_config_id = ?", filters.model);
  if (filters.status && statuses.includes(filters.status as typeof statuses[number])) add("j.status = ?::\"GenerationStatus\"", filters.status);
  const clause = where.length ? `WHERE ${where.join(" AND ")}` : "";
  const [jobs, totals, users, models] = await Promise.all([
    db.query<{ id: string; createdAt: Date; userId: string | null; user: string | null; model: string; status: string; credits: string | null; actual: string | null; error: string | null }>(`SELECT j.id,j.created_at AS "createdAt",j.user_id AS "userId",COALESCE(u.display_name,u.email,'Стенд') AS user,c.display_name AS model,j.status::text AS status,j.credit_price::text AS credits,j.actual_cost::text AS actual,j.last_error_message AS error FROM generation_jobs j LEFT JOIN users u ON u.id=j.user_id JOIN model_configs c ON c.id=j.model_config_id ${clause} ORDER BY j.created_at DESC LIMIT 200`, values),
    db.query<{ count: string; cost: string; credits: string }>(`SELECT COUNT(*)::text AS count,COALESCE(SUM(j.actual_cost),0)::text AS cost,COALESCE(SUM(j.credit_price),0)::text AS credits FROM generation_jobs j ${clause}`, values),
    db.query<{ id: string; name: string }>(`SELECT id,COALESCE(display_name,email) AS name FROM users ORDER BY name`),
    db.query<{ id: string; name: string }>(`SELECT id,display_name AS name FROM model_configs ORDER BY display_name`),
  ]);
  const total = totals.rows[0] ?? { count: "0", cost: "0", credits: "0" };
  return <main className="admin-page"><section className="admin-shell"><header className="admin-header"><div><p className="eyebrow">Контроль расходов</p><h1>Подробные расходы</h1><p>Фактические расходы Polza и стоимость задач для учеников.</p></div><AdminNav /></header><form className="admin-filters" method="GET"><label>С<input name="from" type="date" defaultValue={filters.from} /></label><label>По<input name="to" type="date" defaultValue={filters.to} /></label><label>Пользователь<select name="user" defaultValue={filters.user ?? ""}><option value="">Все</option>{users.rows.map((user) => <option key={user.id} value={user.id}>{user.name}</option>)}</select></label><label>Модель<select name="model" defaultValue={filters.model ?? ""}><option value="">Все</option>{models.rows.map((model) => <option key={model.id} value={model.id}>{model.name}</option>)}</select></label><label>Статус<select name="status" defaultValue={filters.status ?? ""}><option value="">Все</option>{statuses.map((status) => <option key={status} value={status}>{statusLabels[status]}</option>)}</select></label><button className="primary" type="submit">Применить</button><Link href="/admin/expenses">Сбросить</Link></form><section className="admin-metrics admin-expense-metrics"><article className="admin-metric"><span>Задач</span><strong>{total.count}</strong></article><article className="admin-metric"><span>Расход Polza</span><strong>{money.format(Number(total.cost))} ₽</strong></article><article className="admin-metric"><span>Списано кредитов</span><strong>{money.format(Number(total.credits))}</strong></article></section><section className="admin-section"><p className="admin-section-note">Показаны последние 200 задач по выбранным фильтрам.</p><div className="table-wrap"><table><thead><tr><th>Время</th><th>Пользователь</th><th>Модель</th><th>Статус</th><th>Кредиты</th><th>Расход Polza</th><th>Ошибка</th></tr></thead><tbody>{jobs.rows.map((job) => <tr key={job.id}><td>{new Intl.DateTimeFormat("ru-RU", { dateStyle: "short", timeStyle: "short" }).format(job.createdAt)}</td><td>{job.userId ? <Link href={`/admin/users/${job.userId}`}>{job.user}</Link> : job.user}</td><td>{job.model}</td><td>{statusLabels[job.status] ?? job.status}</td><td>{job.credits ?? "—"}</td><td>{job.actual === null ? "—" : `${money.format(Number(job.actual))} ₽`}</td><td className="admin-prompt">{job.error ?? "—"}</td></tr>)}{!jobs.rows.length && <tr><td className="empty" colSpan={7}>По выбранным условиям задач нет.</td></tr>}</tbody></table></div></section></section></main>;
}
