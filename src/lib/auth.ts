import { createHash, randomBytes, randomUUID } from "node:crypto";
import bcrypt from "bcryptjs";
import type { PoolClient } from "pg";
import { getDatabasePool } from "./database.ts";
import { INITIAL_ACCESS_SETTINGS } from "./stage-one-defaults.ts";

export const SESSION_COOKIE = "aggregator_session";
const DAY_MS = 86_400_000;
const SESSION_DAYS = 30;

export type Viewer = { id: string; email: string; role: "ADMIN" | "USER" | "GUEST"; displayName: string | null };

export function normalizeEmail(value: string): string { return value.trim().toLowerCase(); }
export function validateEmail(value: string): void {
  if (value.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) throw new Error("Укажите email в формате name@example.com.");
}
export function validateStudentName(value: string): string {
  const name = value.trim().replace(/\s+/g, " ");
  if (name.length < 2 || name.length > 80) throw new Error("Имя должно содержать от 2 до 80 символов.");
  if (!/^[А-Яа-яЁё]+(?:[ -][А-Яа-яЁё]+)*$/.test(name)) throw new Error("Имя указывается кириллицей; допустимы только буквы, пробел и дефис.");
  return name;
}
export function validatePassword(value: string): void {
  if (value.length < 12) throw new Error("Пароль должен содержать минимум 12 символов.");
  if (value.length > 200) throw new Error("Пароль слишком длинный.");
}

export async function createInvitation(input: { actor: Viewer; email: string; displayName?: string; emergency?: boolean; guest?: boolean; guestCredits?: number }): Promise<{ token: string; expiresAt: Date }> {
  if (input.actor.role !== "ADMIN") throw new Error("Недостаточно прав.");
  const email = normalizeEmail(input.email); validateEmail(email);
  const displayName = validateStudentName(input.displayName ?? "");
  if (input.guest && input.emergency) throw new Error("Гостевую ссылку нельзя делать аварийной.");
  const guestCredits = input.guest ? Number(input.guestCredits ?? 50) : null;
  if (guestCredits !== null && (!Number.isFinite(guestCredits) || guestCredits < 0 || guestCredits > 100_000)) throw new Error("Лимит гостевых кредитов должен быть от 0 до 100 000.");
  const existing = await getDatabasePool().query<{ isBlocked: boolean }>(`SELECT is_blocked AS "isBlocked" FROM users WHERE email=$1 LIMIT 1`, [email]);
  if (existing.rowCount && !input.emergency) throw new Error("Аккаунт с этим email уже существует. Обычное приглашение для него создавать не нужно.");
  if (existing.rows[0]?.isBlocked) throw new Error("Аккаунт с этим email заблокирован. Сначала снимите блокировку.");
  const token = secret(); const expiresAt = new Date(Date.now() + (input.emergency ? 60 * 60_000 : 90 * DAY_MS));
  await getDatabasePool().query(`INSERT INTO invitations (id,email,display_name,token_hash,is_emergency,is_guest,guest_credits,status,expires_at,created_by_user_id) VALUES ($1,$2,$3,$4,$5,$6,$7,'PENDING',$8,$9)`, [randomUUID(), email, displayName, hash(token), input.emergency === true, input.guest === true, guestCredits, expiresAt, input.actor.id]);
  await audit(input.actor.id, "INVITATION_CREATED", "invitation", null, { email, emergency: input.emergency === true, guest: input.guest === true, guestCredits, purpose: existing.rowCount ? "EMERGENCY_LOGIN" : "ACCOUNT_ACTIVATION", expiresAt: expiresAt.toISOString() });
  return { token, expiresAt };
}

export async function revokeInvitation(actor: Viewer, invitationId: string): Promise<void> {
  if (actor.role !== "ADMIN") throw new Error("Недостаточно прав.");
  const result = await getDatabasePool().query(`UPDATE invitations SET status='REVOKED',revoked_at=CURRENT_TIMESTAMP WHERE id=$1 AND status='PENDING' RETURNING id`, [invitationId]);
  if (!result.rowCount) throw new Error("Приглашение уже использовано, отозвано или не найдено.");
  await audit(actor.id, "INVITATION_REVOKED", "invitation", invitationId, {});
}

export async function listInvitations(actor: Viewer): Promise<Array<{ id: string; email: string; displayName: string | null; status: string; expiresAt: string; createdAt: string }>> {
  if (actor.role !== "ADMIN") throw new Error("Недостаточно прав.");
  const result = await getDatabasePool().query<{ id: string; email: string; displayName: string | null; status: string; expiresAt: Date; createdAt: Date }>(`SELECT id,email,display_name AS "displayName",status::text AS status,expires_at AS "expiresAt",created_at AS "createdAt" FROM invitations ORDER BY created_at DESC LIMIT 100`);
  return result.rows.map((row) => ({ ...row, expiresAt: row.expiresAt.toISOString(), createdAt: row.createdAt.toISOString() }));
}

export async function activateInvitation(input: { token: string; password: string }): Promise<Viewer> {
  validatePassword(input.password); const client = await getDatabasePool().connect();
  try {
    await client.query("BEGIN");
    const invitation = await client.query<InvitationRow>(`SELECT id,email,display_name AS "displayName",is_emergency AS "isEmergency",is_guest AS "isGuest",guest_credits::text AS "guestCredits" FROM invitations WHERE token_hash=$1 AND status='PENDING' AND expires_at>CURRENT_TIMESTAMP FOR UPDATE`, [hash(input.token)]);
    if (!invitation.rowCount) throw new Error("Ссылка недействительна или срок её действия истёк.");
    const row = invitation.rows[0];
    const existing = await client.query(`SELECT id FROM users WHERE email=$1 FOR UPDATE`, [row.email]);
    if (existing.rowCount && row.isEmergency) throw new Error("Для этого аккаунта ссылка предназначена для безопасного входа — откройте её заново и нажмите «Войти». ");
    if (existing.rowCount) throw new Error("Аккаунт с этим email уже существует.");
    const userId = randomUUID(); const now = new Date(); const guest = row.isGuest; const accessDays = guest ? 2 : INITIAL_ACCESS_SETTINGS.accessDays; const endsAt = new Date(now.getTime() + accessDays * DAY_MS); const role = guest ? "GUEST" : "USER";
    await client.query(`INSERT INTO users (id,email,password_hash,display_name,role,updated_at) VALUES ($1,$2,$3,$4,$5::"UserRole",CURRENT_TIMESTAMP)`, [userId, row.email, await bcrypt.hash(input.password, 12), row.displayName, role]);
    await client.query(`UPDATE invitations SET status='USED',used_at=CURRENT_TIMESTAMP WHERE id=$1`, [row.id]);
    const accessId = randomUUID();
    await client.query(`INSERT INTO access_periods (id,user_id,starts_at,ends_at,status) VALUES ($1,$2,$3,$4,'ACTIVE')`, [accessId, userId, now, endsAt]);
    const credits = guest ? Number(row.guestCredits ?? 50) : INITIAL_ACCESS_SETTINGS.startingCredits;
    await client.query(`INSERT INTO credit_ledger (id,user_id,amount,kind,reason,metadata) VALUES ($1,$2,$3,'GRANT',$4,$5::jsonb)`, [randomUUID(), userId, credits, guest ? "Гостевой лимит" : "Стартовый учебный пакет", JSON.stringify({ invitationId: row.id, guest })]);
    if (!guest) { const free = INITIAL_ACCESS_SETTINGS.freeDeepSeek; await client.query(`INSERT INTO free_text_allowances (id,user_id,access_period_id,total_limit,daily_limit,day_starts_at,max_external_budget) VALUES ($1,$2,$3,$4,$5,(CURRENT_TIMESTAMP AT TIME ZONE 'Europe/Moscow')::date,$6)`, [randomUUID(), userId, accessId, free.totalMessages, free.dailyMessages, free.maxExternalBudgetRub]); }
    await client.query(`INSERT INTO audit_log (id,actor_user_id,action,target_type,target_id,details) VALUES ($1,$2,'INVITATION_ACTIVATED','user',$2,$3::jsonb)`, [randomUUID(), userId, JSON.stringify({ invitationId: row.id, accessEndsAt: endsAt.toISOString() })]);
    await client.query("COMMIT"); return { id: userId, email: row.email, role, displayName: row.displayName };
  } catch (error) { await client.query("ROLLBACK").catch(() => undefined); throw error; } finally { client.release(); }
}

/** Determines what an invitation URL does without exposing its email address. */
export async function invitationLanding(token: string): Promise<"ACTIVATE" | "EMERGENCY_LOGIN" | "USED" | null> {
  const invitation = await getDatabasePool().query<{ email: string; isEmergency: boolean; status: string; isValid: boolean }>(`SELECT email,is_emergency AS "isEmergency",status::text AS status,expires_at>CURRENT_TIMESTAMP AS "isValid" FROM invitations WHERE token_hash=$1`, [hash(token)]);
  const row = invitation.rows[0];
  if (!row || !row.isValid) return null;
  if (row.status === "USED") return "USED";
  if (row.status !== "PENDING") return null;
  if (!row.isEmergency) return "ACTIVATE";
  const user = await getDatabasePool().query(`SELECT 1 FROM users WHERE email=$1 AND is_blocked=false LIMIT 1`, [row.email]);
  return user.rowCount ? "EMERGENCY_LOGIN" : "ACTIVATE";
}

/** Consumes a 1-hour emergency URL for an existing account and creates a regular 30-day browser session. */
export async function enterWithEmergencyInvitation(token: string): Promise<{ viewer: Viewer; token: string }> {
  const client = await getDatabasePool().connect();
  try {
    await client.query("BEGIN");
    const invitation = await client.query<InvitationRow>(`SELECT id,email,display_name AS "displayName",is_emergency AS "isEmergency" FROM invitations WHERE token_hash=$1 AND status='PENDING' AND expires_at>CURRENT_TIMESTAMP FOR UPDATE`, [hash(token)]);
    const row = invitation.rows[0];
    if (!row?.isEmergency) throw new Error("Ссылка недействительна или не предназначена для аварийного входа.");
    const user = await client.query<UserRow>(`SELECT id,email,role::text AS role,display_name AS "displayName",password_hash AS "passwordHash",is_blocked AS "isBlocked" FROM users WHERE email=$1 FOR UPDATE`, [row.email]);
    const account = user.rows[0];
    if (!account || account.isBlocked) throw new Error("Для этого адреса ещё нет доступного аккаунта. Сначала активируйте приглашение и задайте пароль.");
    await client.query(`UPDATE invitations SET status='USED',used_at=CURRENT_TIMESTAMP WHERE id=$1`, [row.id]);
    const sessionToken = secret();
    await client.query(`INSERT INTO auth_sessions (id,user_id,token_hash,expires_at) VALUES ($1,$2,$3,$4)`, [randomUUID(), account.id, hash(sessionToken), new Date(Date.now() + SESSION_DAYS * DAY_MS)]);
    await client.query(`INSERT INTO audit_log (id,actor_user_id,action,target_type,target_id,details) VALUES ($1,$2,'EMERGENCY_LOGIN','user',$2,$3::jsonb)`, [randomUUID(), account.id, JSON.stringify({ invitationId: row.id })]);
    await client.query("COMMIT");
    return { viewer: toViewer(account), token: sessionToken };
  } catch (error) { await client.query("ROLLBACK").catch(() => undefined); throw error; } finally { client.release(); }
}

export async function login(emailInput: string, password: string): Promise<{ viewer: Viewer; token: string }> {
  const email = normalizeEmail(emailInput); const result = await getDatabasePool().query<UserRow>(`SELECT id,email,role::text AS role,display_name AS "displayName",password_hash AS "passwordHash",is_blocked AS "isBlocked" FROM users WHERE email=$1`, [email]);
  const user = result.rows[0];
  if (!user || user.isBlocked || !await bcrypt.compare(password, user.passwordHash)) throw new Error("Неверный email или пароль.");
  if (user.role === "GUEST" && !await hasActiveAccess(user.id)) throw new Error("Срок гостевого доступа закончился.");
  const token = secret(); await getDatabasePool().query(`INSERT INTO auth_sessions (id,user_id,token_hash,expires_at) VALUES ($1,$2,$3,$4)`, [randomUUID(), user.id, hash(token), new Date(Date.now() + SESSION_DAYS * DAY_MS)]);
  await audit(user.id, "LOGIN", "user", user.id, {}); return { viewer: toViewer(user), token };
}

export async function viewerFromToken(token: string | undefined): Promise<Viewer | null> {
  if (!token) return null;
  const result = await getDatabasePool().query<UserRow>(`SELECT u.id,u.email,u.role::text AS role,u.display_name AS "displayName",u.is_blocked AS "isBlocked",'' AS "passwordHash" FROM auth_sessions s JOIN users u ON u.id=s.user_id WHERE s.token_hash=$1 AND s.revoked_at IS NULL AND s.expires_at>CURRENT_TIMESTAMP`, [hash(token)]);
  const user = result.rows[0]; if (!user || user.isBlocked) return null;
  if (user.role === "GUEST" && !await hasActiveAccess(user.id)) return null;
  await getDatabasePool().query(`UPDATE auth_sessions SET last_seen_at=CURRENT_TIMESTAMP WHERE token_hash=$1`, [hash(token)]);
  return toViewer(user);
}

export async function logout(token: string | undefined): Promise<void> { if (token) await getDatabasePool().query(`UPDATE auth_sessions SET revoked_at=CURRENT_TIMESTAMP WHERE token_hash=$1 AND revoked_at IS NULL`, [hash(token)]); }

export async function requestPasswordReset(emailInput: string): Promise<string | null> {
  const email = normalizeEmail(emailInput); const result = await getDatabasePool().query<{ id: string; email: string; displayName: string | null }>(`SELECT id,email,display_name AS "displayName" FROM users WHERE email=$1 AND is_blocked=false`, [email]);
  const user = result.rows[0]; if (!user) return null;
  const token = secret(); const expiresAt = new Date(Date.now() + 60 * 60_000);
  await getDatabasePool().query(`UPDATE password_reset_tokens SET used_at=CURRENT_TIMESTAMP WHERE user_id=$1 AND used_at IS NULL`, [user.id]);
  await getDatabasePool().query(`INSERT INTO password_reset_tokens (id,user_id,token_hash,expires_at) VALUES ($1,$2,$3,$4)`, [randomUUID(), user.id, hash(token), expiresAt]);
  await audit(user.id, "PASSWORD_RESET_REQUESTED", "user", user.id, {}); return token;
}

export async function resetPassword(input: { token: string; password: string }): Promise<void> {
  validatePassword(input.password); const client = await getDatabasePool().connect();
  try {
    await client.query("BEGIN");
    const reset = await client.query<{ id: string; userId: string }>(`SELECT id,user_id AS "userId" FROM password_reset_tokens WHERE token_hash=$1 AND used_at IS NULL AND expires_at>CURRENT_TIMESTAMP FOR UPDATE`, [hash(input.token)]);
    if (!reset.rowCount) throw new Error("Ссылка недействительна или срок её действия истёк.");
    await client.query(`UPDATE users SET password_hash=$2 WHERE id=$1`, [reset.rows[0].userId, await bcrypt.hash(input.password, 12)]);
    await client.query(`UPDATE password_reset_tokens SET used_at=CURRENT_TIMESTAMP WHERE user_id=$1 AND used_at IS NULL`, [reset.rows[0].userId]);
    await client.query(`UPDATE auth_sessions SET revoked_at=CURRENT_TIMESTAMP WHERE user_id=$1 AND revoked_at IS NULL`, [reset.rows[0].userId]);
    await client.query(`INSERT INTO audit_log (id,actor_user_id,action,target_type,target_id,details) VALUES ($1,$2,'PASSWORD_RESET','user',$2,'{}'::jsonb)`, [randomUUID(), reset.rows[0].userId]);
    await client.query("COMMIT");
  } catch (error) { await client.query("ROLLBACK").catch(() => undefined); throw error; } finally { client.release(); }
}

export async function changeOwnPassword(viewer: Viewer, currentPassword: string, nextPassword: string): Promise<void> {
  validatePassword(nextPassword); const result = await getDatabasePool().query<{ passwordHash: string }>(`SELECT password_hash AS "passwordHash" FROM users WHERE id=$1 AND is_blocked=false`, [viewer.id]);
  if (!result.rowCount || !await bcrypt.compare(currentPassword, result.rows[0].passwordHash)) throw new Error("Текущий пароль указан неверно.");
  await getDatabasePool().query(`UPDATE users SET password_hash=$2 WHERE id=$1`, [viewer.id, await bcrypt.hash(nextPassword, 12)]);
  await getDatabasePool().query(`UPDATE auth_sessions SET revoked_at=CURRENT_TIMESTAMP WHERE user_id=$1 AND revoked_at IS NULL`, [viewer.id]);
  await audit(viewer.id, "PASSWORD_CHANGED", "user", viewer.id, {});
}

export async function setUserBlocked(actor: Viewer, userId: string, blocked: boolean, reason: string): Promise<void> {
  if (actor.role !== "ADMIN" || !reason.trim()) throw new Error("Недостаточно прав или не указана причина.");
  await getDatabasePool().query(`UPDATE users SET is_blocked=$2 WHERE id=$1`, [userId, blocked]);
  if (blocked) await getDatabasePool().query(`UPDATE auth_sessions SET revoked_at=CURRENT_TIMESTAMP WHERE user_id=$1 AND revoked_at IS NULL`, [userId]);
  await audit(actor.id, blocked ? "USER_BLOCKED" : "USER_UNBLOCKED", "user", userId, { reason: reason.trim() });
}

export async function createAdministrator(actor: Viewer, input: { email: string; password: string; displayName?: string }): Promise<Viewer> {
  if (actor.role !== "ADMIN") throw new Error("Недостаточно прав.");
  validatePassword(input.password); const email = normalizeEmail(input.email); if (!email.includes("@")) throw new Error("Укажите корректный email.");
  const id = randomUUID();
  try { await getDatabasePool().query(`INSERT INTO users (id,email,password_hash,display_name,role,updated_at) VALUES ($1,$2,$3,$4,'ADMIN',CURRENT_TIMESTAMP)`, [id, email, await bcrypt.hash(input.password, 12), input.displayName?.trim() || null]); }
  catch { throw new Error("Аккаунт с этим email уже существует."); }
  await audit(actor.id, "ADMIN_CREATED", "user", id, { email }); return { id, email, role: "ADMIN", displayName: input.displayName?.trim() || null };
}

/** Replaces all previous emergency codes and returns plaintext values exactly once. */
export async function createRecoveryCodes(viewer: Viewer, currentPassword: string): Promise<string[]> {
  if (viewer.role !== "ADMIN") throw new Error("Коды восстановления доступны только администратору.");
  const row = await getDatabasePool().query<{ passwordHash: string }>(`SELECT password_hash AS "passwordHash" FROM users WHERE id=$1`, [viewer.id]);
  if (!row.rowCount || !await bcrypt.compare(currentPassword, row.rows[0].passwordHash)) throw new Error("Текущий пароль указан неверно.");
  const codes = Array.from({ length: 10 }, () => `${randomBytes(4).toString("hex").toUpperCase()}-${randomBytes(4).toString("hex").toUpperCase()}`);
  const client = await getDatabasePool().connect();
  try { await client.query("BEGIN"); await client.query(`DELETE FROM admin_recovery_codes WHERE user_id=$1 AND used_at IS NULL`, [viewer.id]); for (const code of codes) await client.query(`INSERT INTO admin_recovery_codes (id,user_id,code_hash) VALUES ($1,$2,$3)`, [randomUUID(), viewer.id, hash(code)]); await client.query("COMMIT"); }
  catch (error) { await client.query("ROLLBACK").catch(() => undefined); throw error; } finally { client.release(); }
  await audit(viewer.id, "ADMIN_RECOVERY_CODES_GENERATED", "user", viewer.id, {}); return codes;
}

export async function recoverAdministrator(input: { email: string; code: string; password: string }): Promise<void> {
  validatePassword(input.password); const client = await getDatabasePool().connect();
  try { await client.query("BEGIN"); const row = await client.query<{ codeId: string; userId: string }>(`SELECT c.id AS "codeId",u.id AS "userId" FROM admin_recovery_codes c JOIN users u ON u.id=c.user_id WHERE u.email=$1 AND u.role='ADMIN' AND u.is_blocked=false AND c.code_hash=$2 AND c.used_at IS NULL FOR UPDATE`, [normalizeEmail(input.email), hash(input.code.trim().toUpperCase())]);
    if (!row.rowCount) throw new Error("Email или код восстановления неверны.");
    await client.query(`UPDATE users SET password_hash=$2 WHERE id=$1`, [row.rows[0].userId, await bcrypt.hash(input.password, 12)]);
    await client.query(`UPDATE admin_recovery_codes SET used_at=CURRENT_TIMESTAMP WHERE id=$1`, [row.rows[0].codeId]);
    await client.query(`UPDATE auth_sessions SET revoked_at=CURRENT_TIMESTAMP WHERE user_id=$1 AND revoked_at IS NULL`, [row.rows[0].userId]);
    await client.query("COMMIT"); await audit(row.rows[0].userId, "ADMIN_RECOVERED_WITH_CODE", "user", row.rows[0].userId, {});
  } catch (error) { await client.query("ROLLBACK").catch(() => undefined); throw error; } finally { client.release(); }
}

export async function consumeRateLimit(key: string, limit: number, windowMs: number): Promise<boolean> {
  const client = await getDatabasePool().connect();
  try {
    await client.query("BEGIN"); const current = await client.query<{ windowStartedAt: Date; attempts: number }>(`SELECT window_started_at AS "windowStartedAt",attempts FROM auth_rate_limits WHERE key=$1 FOR UPDATE`, [key]);
    const fresh = !current.rowCount || Date.now() - new Date(current.rows[0].windowStartedAt).getTime() >= windowMs;
    const attempts = fresh ? 1 : current.rows[0].attempts + 1;
    if (!current.rowCount) await client.query(`INSERT INTO auth_rate_limits (key,window_started_at,attempts) VALUES ($1,CURRENT_TIMESTAMP,1)`, [key]);
    else await client.query(`UPDATE auth_rate_limits SET window_started_at=CASE WHEN $2 THEN CURRENT_TIMESTAMP ELSE window_started_at END,attempts=$3 WHERE key=$1`, [key, fresh, attempts]);
    await client.query("COMMIT"); return attempts <= limit;
  } catch (error) { await client.query("ROLLBACK").catch(() => undefined); throw error; } finally { client.release(); }
}

export function cookieHeader(token: string): string { return `${SESSION_COOKIE}=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${SESSION_DAYS * 86_400}${process.env.NODE_ENV === "production" ? "; Secure" : ""}`; }
export function expiredCookieHeader(): string { return `${SESSION_COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${process.env.NODE_ENV === "production" ? "; Secure" : ""}`; }
export function tokenFromRequest(request: Request): string | undefined { return request.headers.get("cookie")?.split(";").map((part) => part.trim().split("=")).find(([key]) => key === SESSION_COOKIE)?.slice(1).join("="); }
export function resetUrl(token: string): string { const appUrl = process.env.APP_URL?.replace(/\/$/, ""); if (!appUrl) throw new Error("APP_URL is not set."); return `${appUrl}/reset-password?token=${encodeURIComponent(token)}`; }

export async function sendResetEmail(input: { to: string; name: string | null; token: string }): Promise<void> {
  const serverToken = process.env.POSTMARK_SERVER_TOKEN; const from = process.env.POSTMARK_FROM;
  if (!serverToken || !from) throw new Error("Почтовый сервис ещё не настроен.");
  const url = resetUrl(input.token); const response = await fetch("https://api.postmarkapp.com/email", { method: "POST", headers: { "X-Postmark-Server-Token": serverToken, "Content-Type": "application/json" }, body: JSON.stringify({ From: from, To: input.to, Subject: "Сброс пароля — AI-агрегатор", TextBody: `Здравствуйте${input.name ? `, ${input.name}` : ""}!\n\nЧтобы задать новый пароль, откройте ссылку в течение 1 часа:\n${url}\n\nЕсли это были не вы, проигнорируйте письмо.`, MessageStream: "outbound" }) });
  if (!response.ok) throw new Error("Не удалось отправить письмо для сброса пароля.");
}

async function audit(actorUserId: string | null, action: string, targetType: string, targetId: string | null, details: unknown): Promise<void> { await getDatabasePool().query(`INSERT INTO audit_log (id,actor_user_id,action,target_type,target_id,details) VALUES ($1,$2,$3,$4,$5,$6::jsonb)`, [randomUUID(), actorUserId, action, targetType, targetId, JSON.stringify(details)]); }
function secret(): string { return randomBytes(32).toString("base64url"); }
function hash(value: string): string { return createHash("sha256").update(value).digest("hex"); }
function toViewer(row: UserRow): Viewer { return { id: row.id, email: row.email, role: row.role as Viewer["role"], displayName: row.displayName }; }
interface UserRow { id: string; email: string; role: string; displayName: string | null; passwordHash: string; isBlocked: boolean; }
async function hasActiveAccess(userId: string): Promise<boolean> { const result = await getDatabasePool().query(`SELECT 1 FROM access_periods WHERE user_id=$1 AND status='ACTIVE' AND starts_at<=CURRENT_TIMESTAMP AND ends_at>CURRENT_TIMESTAMP LIMIT 1`, [userId]); return result.rowCount === 1; }
interface InvitationRow { id: string; email: string; displayName: string | null; isEmergency: boolean; isGuest: boolean; guestCredits: string | null; }
