import { consumeRateLimit, resetPassword } from "../../../../src/lib/auth.ts";
export async function POST(request: Request): Promise<Response> {
  try {
    const body = await request.json() as { token?: unknown; password?: unknown }; if (typeof body.token !== "string" || typeof body.password !== "string") throw new Error("Нужны ссылка и новый пароль.");
    const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "local"; if (!await consumeRateLimit(`reset:${ip}`, 10, 60 * 60_000)) return Response.json({ error: "Слишком много попыток. Попробуйте позже." }, { status: 429 });
    await resetPassword({ token: body.token, password: body.password }); return Response.json({ ok: true });
  } catch (error) { return Response.json({ error: error instanceof Error ? error.message : "Не удалось изменить пароль." }, { status: 400 }); }
}
