import { consumeRateLimit, recoverAdministrator } from "../../../../src/lib/auth.ts";
export async function POST(request: Request): Promise<Response> {
  try { const body = await request.json() as { email?: unknown; code?: unknown; password?: unknown }; if (typeof body.email !== "string" || typeof body.code !== "string" || typeof body.password !== "string") throw new Error("Укажите email, код и новый пароль.");
    const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "local"; if (!await consumeRateLimit(`admin-recovery:${ip}`, 5, 60 * 60_000)) return Response.json({ error: "Слишком много попыток. Попробуйте позже." }, { status: 429 });
    await recoverAdministrator({ email: body.email, code: body.code, password: body.password }); return Response.json({ ok: true });
  } catch (error) { return Response.json({ error: error instanceof Error ? error.message : "Не удалось восстановить доступ." }, { status: 400 }); }
}
