import Link from "next/link";
import { cookies } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { SESSION_COOKIE, viewerFromToken } from "../../../../src/lib/auth.ts";
import { getAdminUserHistory } from "../../../../src/lib/admin-user-history.ts";

export const dynamic = "force-dynamic";
const date = new Intl.DateTimeFormat("ru-RU", { dateStyle: "medium", timeStyle: "short" });
const rub = new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 2 });
const statuses: Record<string, string> = { QUEUED: "В очереди", SUBMITTED: "Отправлено", PROCESSING: "В работе", COMPLETED: "Готово", FAILED: "Ошибка", CANCELLED: "Отменено", BLOCKED: "Заблокировано", EXPIRED: "Истёк срок" };

export default async function AdminUserHistoryPage({ params }: { params: Promise<{ id: string }> }) {
  const viewer = await viewerFromToken((await cookies()).get(SESSION_COOKIE)?.value);
  if (!viewer || viewer.role !== "ADMIN") redirect("/login");
  const history = await getAdminUserHistory(viewer, (await params).id);
  if (!history) notFound();
  const { user, jobs } = history;
  return <main className="admin-page"><section className="admin-shell">
    <header className="admin-header"><div><p className="eyebrow">Карточка ученика</p><h1>{user.displayName || user.email}</h1><p>{user.email} · баланс {user.balance} кредитов · {user.accessEndsAt ? `доступ до ${date.format(new Date(user.accessEndsAt))}` : "срок доступа не задан"}</p></div><nav aria-label="Навигация карточки"><Link href="/admin/users">К списку учеников</Link><Link href="/admin">Сводка</Link></nav></header>
    <section className="admin-section"><div className="admin-section-heading"><div><p className="eyebrow">История работы</p><h2>Последние {jobs.length} задач</h2></div><span className={user.isBlocked ? "admin-status danger" : "admin-status good"}>{user.isBlocked ? "Аккаунт заблокирован" : "Аккаунт активен"}</span></div><p className="admin-history-hint">Здесь видны запросы, выбранные модели, статусы, стоимость и технические ошибки. История не исчезает вместе с файлами результатов.</p><div className="table-wrap"><table><thead><tr><th>Время</th><th>Модель</th><th>Статус</th><th>Запрос</th><th>Расход</th><th>Ошибка</th></tr></thead><tbody>{jobs.length ? jobs.map((job) => <tr key={job.id}><td>{date.format(new Date(job.createdAt))}</td><td>{job.model}</td><td>{statuses[job.status] ?? job.status}</td><td className="admin-prompt">{job.prompt}</td><td>{job.actualCost === null ? "—" : `${rub.format(job.actualCost)} ₽`}</td><td>{job.error ?? "—"}</td></tr>) : <tr><td colSpan={6} className="empty">У ученика ещё нет задач.</td></tr>}</tbody></table></div></section>
  </section></main>;
}
