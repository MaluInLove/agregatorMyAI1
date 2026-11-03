import { consumeRateLimit, requestPasswordReset, sendResetEmail } from "../../../../src/lib/auth.ts";

const generic = { ok: true, message: "Если аккаунт существует, ссылка для сброса пароля отправлена на email." };
export async function POST(request: Request): Promise<Response> {
  try {
    const body = await request.json() as { email?: unknown }; if (typeof body.email !== "string") throw new Error("Укажите email.");
    const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "local";
    if (!await consumeRateLimit(`forgot:${ip}:${body.email.trim().toLowerCase()}`, 3, 60 * 60_000)) return Response.json(generic);
    const token = await requestPasswordReset(body.email);
    if (token) await sendResetEmail({ to: body.email.trim(), name: null, token });
  } catch { /* Keep the same response so callers cannot enumerate accounts or mail configuration. */ }
  return Response.json(generic);
}
