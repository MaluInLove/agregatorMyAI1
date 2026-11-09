import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { SESSION_COOKIE, viewerFromToken } from "../../../src/lib/auth.ts";
import { AdminNav } from "../admin-nav";

export const dynamic = "force-dynamic";

function ReportForm({ report, title, description }: { report: "expenses" | "audit"; title: string; description: string }) {
  return <section className="admin-section admin-report-card"><h2>{title}</h2><p className="admin-section-note">{description}</p><form className="admin-filters" action="/api/admin/reports" method="GET"><input type="hidden" name="report" value={report} /><label>С<input name="from" type="date" /></label><label>По<input name="to" type="date" /></label><button className="primary" type="submit">Скачать CSV</button></form></section>;
}

export default async function Page() {
  const viewer = await viewerFromToken((await cookies()).get(SESSION_COOKIE)?.value);
  if (!viewer || viewer.role !== "ADMIN") redirect("/login");
  return <main className="admin-page"><section className="admin-shell"><header className="admin-header"><div><p className="eyebrow">Административная выгрузка</p><h1>Экспорт отчётов</h1><p>CSV открывается в Excel и сохраняет фильтрацию по периоду. В выгрузках нет ключей и ответов провайдеров.</p></div><AdminNav /></header><ReportForm report="expenses" title="Расходы" description="Задачи, кредиты, фактические расходы Polza, статусы и ошибки за выбранный период." /><ReportForm report="audit" title="Аудит" description="Действия администраторов и системы за выбранный период, включая изменения хранения файлов." /></section></main>;
}
