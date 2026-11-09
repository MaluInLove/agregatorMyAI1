import Link from "next/link";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { SESSION_COOKIE, viewerFromToken } from "../../../src/lib/auth.ts";
import { getDatabasePool } from "../../../src/lib/database.ts";
import { AdminNav } from "../admin-nav";

export const dynamic = "force-dynamic";
const date = new Intl.DateTimeFormat("ru-RU", { dateStyle: "short", timeStyle: "short" });
const selectableStatuses = ["QUEUED", "SUBMITTED", "PROCESSING", "FAILED"] as const;
const labels: Record<string, string> = { QUEUED: "В очереди", SUBMITTED: "Принята Polza", PROCESSING: "В обработке", FAILED: "Ошибка" };
type Query = { status?: string; model?: string };

export default async function Page({ searchParams }: { searchParams: Promise<Query> }) {
  const viewer = await viewerFromToken((await cookies()).get(SESSION_COOKIE)?.value);
  if (!viewer || viewer.role !== "ADMIN") redirect("/login");
  const filters = await searchParams; const db = getDatabasePool(); const values: string[] = []; const where: string[] = ["j.status IN ('QUEUED','SUBMITTED','PROCESSING','FAILED')"];
  if (filters.status && selectableStatuses.includes(filters.status as typeof selectableStatuses[number])) { values.push(filters.status); where.push(`j.status=$${values.length}::\"GenerationStatus\"`); }
  if (filters.model) { values.push(filters.model); where.push(`j.model_config_id=$${values.length}`); }
  const clause = `WHERE ${where.join(" AND ")}`;
  const [metrics, jobs, models] = await Promise.all([
    db.query<{ queued: string; retrying: string; working: string; delayed: string; suspicious: string }>(
      `SELECT COUNT(*) FILTER (WHERE j.status='QUEUED')::text AS queued,
              COUNT(*) FILTER (WHERE j.status='QUEUED' AND j.next_retry_at IS NOT NULL)::text AS retrying,
              COUNT(*) FILTER (WHERE j.status IN ('SUBMITTED','PROCESSING'))::text AS working,
              COUNT(*) FILTER (WHERE j.status='QUEUED' AND j.available_at>CURRENT_TIMESTAMP)::text AS delayed,
              COUNT(*) FILTER (WHERE j.status IN ('SUBMITTED','PROCESSING') AND c.long_running_after_seconds IS NOT NULL AND COALESCE(j.processing_started_at,j.submitted_at,j.created_at) < CURRENT_TIMESTAMP - (c.long_running_after_seconds * INTERVAL '1 second'))::text AS suspicious
       FROM generation_jobs j JOIN model_configs c ON c.id=j.model_config_id`),
    db.query<{ id: string; createdAt: Date; user: string | null; model: string; status: string; attempts: number; maxAttempts: number; availableAt: Date; nextRetryAt: Date | null; leaseUntil: Date | null; threshold: number | null; isLong: boolean; error: string | null }>(
      `SELECT j.id,j.created_at AS "createdAt",COALESCE(u.display_name,u.email,'Стенд / система') AS user,c.display_name AS model,j.status::text AS status,j.attempt_count AS attempts,j.max_attempts AS "maxAttempts",j.available_at AS "availableAt",j.next_retry_at AS "nextRetryAt",j.lease_expires_at AS "leaseUntil",c.long_running_after_seconds AS threshold,(j.status IN ('SUBMITTED','PROCESSING') AND c.long_running_after_seconds IS NOT NULL AND COALESCE(j.processing_started_at,j.submitted_at,j.created_at) < CURRENT_TIMESTAMP - (c.long_running_after_seconds * INTERVAL '1 second')) AS "isLong",j.last_error_message AS error
       FROM generation_jobs j JOIN model_configs c ON c.id=j.model_config_id LEFT JOIN users u ON u.id=j.user_id
       ${clause} ORDER BY CASE j.status WHEN 'QUEUED' THEN 0 WHEN 'PROCESSING' THEN 1 WHEN 'SUBMITTED' THEN 2 ELSE 3 END,j.available_at ASC,j.created_at ASC LIMIT 250`, values),
    db.query<{ id: string; name: string }>("SELECT id,display_name AS name FROM model_configs ORDER BY display_name"),
  ]);
  const total = metrics.rows[0] ?? { queued: "0", retrying: "0", working: "0", delayed: "0", suspicious: "0" };
  return <main className="admin-page"><section className="admin-shell"><header className="admin-header"><div><p className="eyebrow">Управление потоком задач</p><h1>Очередь</h1><p>Здесь видны задержки и безопасные автоматические повторы. Повторно отправлять уже принятые Polza задачи нельзя: это защищает от дублей и двойного расхода.</p></div><AdminNav /></header><section className="admin-metrics admin-queue-metrics"><article className="admin-metric"><span>В очереди</span><strong>{total.queued}</strong><small>Ожидают worker</small></article><article className="admin-metric"><span>Автоповторы</span><strong>{total.retrying}</strong><small>Только безопасные ошибки</small></article><article className="admin-metric"><span>В обработке</span><strong>{total.working}</strong><small>Принятые провайдером</small></article><article className="admin-metric"><span>Отложены</span><strong>{total.delayed}</strong><small>Имеют время запуска</small></article><article className={Number(total.suspicious) ? "admin-metric danger" : "admin-metric"}><span>Долгие</span><strong>{total.suspicious}</strong><small>Сверх порога модели</small></article></section><form className="admin-filters" method="GET"><label>Статус<select name="status" defaultValue={filters.status ?? ""}><option value="">Все</option>{selectableStatuses.map((status) => <option key={status} value={status}>{labels[status]}</option>)}</select></label><label>Модель<select name="model" defaultValue={filters.model ?? ""}><option value="">Все</option>{models.rows.map((model) => <option key={model.id} value={model.id}>{model.name}</option>)}</select></label><button className="primary" type="submit">Применить</button><Link href="/admin/queue">Сбросить</Link><Link href="/admin/models">Настроить модели</Link></form><section className="admin-section"><p className="admin-section-note">Показаны до 250 активных и ошибочных задач. Отменить можно только пользователю до захвата worker; администратор управляет новыми запусками через статус модели.</p><div className="table-wrap"><table><thead><tr><th>Создана</th><th>Пользователь</th><th>Модель</th><th>Статус</th><th>Попытки</th><th>Следующее действие</th><th>Lease / долго</th><th>Последняя ошибка</th></tr></thead><tbody>{jobs.rows.map((job) => <tr key={job.id}><td>{date.format(job.createdAt)}</td><td>{job.user}</td><td>{job.model}</td><td><span className={job.status === "FAILED" ? "admin-status danger" : "admin-status good"}>{labels[job.status] ?? job.status}</span></td><td>{job.attempts} / {job.maxAttempts}</td><td>{job.status === "QUEUED" ? date.format(job.availableAt) : job.nextRetryAt ? `Повтор: ${date.format(job.nextRetryAt)}` : "Ожидание Polza"}</td><td>{job.isLong ? <span className="admin-status danger">Дольше {job.threshold} сек.</span> : job.leaseUntil ? `До ${date.format(job.leaseUntil)}` : "—"}</td><td className="admin-prompt">{job.error ?? "—"}</td></tr>)}{!jobs.rows.length && <tr><td className="empty" colSpan={8}>Задач по выбранным условиям нет.</td></tr>}</tbody></table></div></section></section></main>;
}
