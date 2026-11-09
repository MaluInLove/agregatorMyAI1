import Link from "next/link";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { SESSION_COOKIE, viewerFromToken } from "../../../src/lib/auth.ts";
import { listAdminUsers } from "../../../src/lib/admin-users.ts";
import { AdminUserManager } from "./user-manager.tsx";

export const dynamic = "force-dynamic";

export default async function AdminUsersPage() {
  const viewer = await viewerFromToken((await cookies()).get(SESSION_COOKIE)?.value);
  if (!viewer || viewer.role !== "ADMIN") redirect("/login");
  const users = await listAdminUsers(viewer);
  return <main className="admin-page"><section className="admin-shell">
    <header className="admin-header"><div><p className="eyebrow">Управление доступом</p><h1>Ученики и кредиты</h1><p>Здесь можно продлить доступ, выдать или списать кредиты и временно ограничить вход.</p></div><nav aria-label="Административные разделы"><Link href="/admin">Сводка</Link><Link href="/admin/access">Приглашения</Link></nav></header>
    <AdminUserManager initialUsers={users} />
    <section className="admin-user-cards"><p className="eyebrow">Диагностика учеников</p><h2>Карточки с историей задач</h2><p>Откройте карточку, чтобы увидеть задачи конкретного ученика, их статусы, ошибки и расходы.</p><div>{users.filter((user) => user.role !== "ADMIN").map((user) => <Link key={user.id} href={`/admin/users/${user.id}`}><strong>{user.displayName || user.email}</strong><span>{user.email}</span><small>Открыть историю задач →</small></Link>)}</div></section>
  </section></main>;
}
