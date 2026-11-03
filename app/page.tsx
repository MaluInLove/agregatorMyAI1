import { getStage0Overview } from "../src/lib/stage0-overview";
import { Stage0Launcher } from "./stage0-launcher";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { SESSION_COOKIE, viewerFromToken } from "../src/lib/auth";
import Link from "next/link";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  const viewer = await viewerFromToken(token);
  if (!viewer || viewer.role !== "ADMIN") redirect("/login");
  const { diagnostics, jobs } = await getStage0Overview();
  const totalJobs = Object.values(diagnostics.queue).reduce((sum, value) => sum + value, 0);
  const queuedJobs = diagnostics.queue.QUEUED ?? 0;
  return (
    <main>
      <section className="card" aria-labelledby="stand-title">
        <p className="eyebrow">Этап 0 · локальный стенд</p>
        <h1 id="stand-title">Интеграция AI-агрегатора</h1>
        <p>Закрытая история тестов и диагностика worker. Ключ Polza в браузер не передаётся.</p>
        <p><Link className="file-link" href="/admin/access">Управление приглашениями и доступом →</Link></p>
        <div className="metrics">
          <div><span>Всего задач</span><strong>{totalJobs}</strong></div>
          <div><span>В очереди</span><strong>{queuedJobs}</strong></div>
          <div><span>Worker</span><strong>{diagnostics.workers.some((worker) => worker.healthy) ? "в сети" : "нет сигнала"}</strong></div>
          <div><span>Хранилище</span><strong>var/storage</strong></div>
        </div>
        <Stage0Launcher />
        <h2>Последние задачи</h2>
        {jobs.length === 0 ? <p className="empty">Пока нет задач, созданных через стенд.</p> : (
          <div className="table-wrap"><table><thead><tr><th>Время</th><th>Модель</th><th>Тип</th><th>Статус</th><th>Попытки</th><th>Стоимость</th><th>Файлы</th><th>Ошибка</th></tr></thead>
            <tbody>{jobs.map((job) => <tr key={job.id}><td>{new Intl.DateTimeFormat("ru-RU", { dateStyle: "short", timeStyle: "medium" }).format(new Date(job.createdAt))}</td><td>{job.displayName}</td><td>{job.kind}</td><td>{job.status}</td><td>{job.attemptCount}</td><td>{job.actualCost ? `${job.actualCost} ${job.actualCostCurrency ?? ""}` : "—"}</td><td>{job.assets.length ? job.assets.map((asset) => <a className="file-link" key={asset.id} href={`/api/stage0/assets/${asset.id}`}>{asset.kind === "WB_RESULT" ? "WB 810×1080" : "Исходник"}</a>) : "—"}</td><td>{job.error ?? "—"}</td></tr>)}</tbody>
          </table></div>
        )}
      </section>
    </main>
  );
}
