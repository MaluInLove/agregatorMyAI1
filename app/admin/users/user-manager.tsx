"use client";

import { useState } from "react";
import type { AdminUser } from "../../../src/lib/admin-users.ts";

type Operation = "credits" | "extend" | "block";
const date = new Intl.DateTimeFormat("ru-RU", { dateStyle: "medium", timeStyle: "short" });
const roles: Record<AdminUser["role"], string> = { ADMIN: "Администратор", USER: "Ученик", GUEST: "Гость" };

export function AdminUserManager({ initialUsers }: { initialUsers: AdminUser[] }) {
  const [users, setUsers] = useState(initialUsers);
  const [target, setTarget] = useState<AdminUser | null>(null);
  const [operation, setOperation] = useState<Operation>("credits");
  const [amount, setAmount] = useState("100");
  const [days, setDays] = useState("30");
  const [credits, setCredits] = useState("0");
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  function open(user: AdminUser, next: Operation) {
    setTarget(user); setOperation(next); setReason(""); setAmount("100"); setDays("30"); setCredits("0"); setMessage("");
  }
  async function reload() {
    const response = await fetch("/api/admin/users", { cache: "no-store" });
    const payload = await response.json() as { users?: AdminUser[]; error?: string };
    if (!response.ok || !payload.users) throw new Error(payload.error ?? "Не удалось обновить список.");
    setUsers(payload.users);
  }
  async function submit() {
    if (!target) return;
    setBusy(true); setMessage("");
    try {
      let response: Response;
      if (operation === "block") {
        response = await fetch(`/api/admin/users/${target.id}/block`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ blocked: !target.isBlocked, reason }) });
      } else {
        const body = operation === "credits"
          ? { action: "credits", userId: target.id, amount: Number(amount), reason }
          : { action: "extend", userId: target.id, days: Number(days), credits: Number(credits), reason };
        response = await fetch("/api/admin/users", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      }
      const payload = await response.json() as { error?: string };
      if (!response.ok) throw new Error(payload.error ?? "Операцию не удалось выполнить.");
      await reload(); setTarget(null);
    } catch (error) { setMessage(error instanceof Error ? error.message : "Операцию не удалось выполнить."); } finally { setBusy(false); }
  }
  const title = operation === "credits" ? "Изменить кредиты" : operation === "extend" ? "Продлить доступ" : target?.isBlocked ? "Разблокировать пользователя" : "Заблокировать пользователя";
  return <>
    <section className="admin-section"><div className="admin-section-heading"><div><p className="eyebrow">Все аккаунты</p><h2>{users.length} пользователей</h2></div><span className="admin-status">Операции сохраняются в журнале аудита</span></div>
      <div className="table-wrap"><table><thead><tr><th>Пользователь</th><th>Роль</th><th>Кредиты</th><th>Доступ до</th><th>Статус</th><th>Действия</th></tr></thead><tbody>{users.map((user) => <tr key={user.id}><td><strong>{user.displayName || "Без имени"}</strong><br /><small>{user.email}</small></td><td>{roles[user.role]}</td><td>{user.balance}</td><td>{user.accessEndsAt ? date.format(new Date(user.accessEndsAt)) : "—"}</td><td>{user.isBlocked ? <span className="admin-status danger">Заблокирован</span> : <span className="admin-status good">Активен</span>}</td><td>{user.role === "ADMIN" ? "—" : <div className="admin-actions"><button type="button" onClick={() => open(user, "credits")}>Кредиты</button><button type="button" onClick={() => open(user, "extend")}>Продлить</button><button type="button" className={user.isBlocked ? "admin-action-neutral" : "admin-action-danger"} onClick={() => open(user, "block")}>{user.isBlocked ? "Разблокировать" : "Блокировать"}</button></div>}</td></tr>)}</tbody></table></div>
    </section>
    {target && <section className="admin-dialog-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget && !busy) setTarget(null); }}><section className="admin-dialog" role="dialog" aria-modal="true" aria-labelledby="admin-operation-title"><h2 id="admin-operation-title">{title}</h2><p><strong>{target.displayName || target.email}</strong><br /><small>{target.email}</small></p>{operation === "credits" && <label>Изменение баланса (можно со знаком минус)<input autoFocus type="number" step="1" min="-100000" max="100000" value={amount} onChange={(event) => setAmount(event.target.value)} /></label>}{operation === "extend" && <><label>Дней доступа<input autoFocus type="number" step="1" min="1" max="365" value={days} onChange={(event) => setDays(event.target.value)} /></label><label>Добавить кредитов (необязательно)<input type="number" step="1" min="0" max="100000" value={credits} onChange={(event) => setCredits(event.target.value)} /></label></>}{operation === "block" && <p>{target.isBlocked ? "Пользователь снова сможет войти в аккаунт." : "Пользователь не сможет войти в аккаунт, пока вы не отмените блокировку."}</p>}<label>Причина для журнала аудита<textarea minLength={3} maxLength={300} value={reason} onChange={(event) => setReason(event.target.value)} placeholder="Например: оплата тарифа за ноябрь" /></label>{message && <p className="admin-dialog-error" role="alert">{message}</p>}<div className="admin-dialog-actions"><button type="button" className={operation === "block" && !target.isBlocked ? "admin-action-danger" : "admin-action-primary"} disabled={busy || reason.trim().length < 3} onClick={() => void submit()}>{busy ? "Сохраняем…" : "Подтвердить"}</button><button type="button" disabled={busy} onClick={() => setTarget(null)}>Отмена</button></div></section></section>}
  </>;
}
