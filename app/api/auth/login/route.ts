import { cookieHeader, consumeRateLimit, login, normalizeEmail } from "../../../../src/lib/auth.ts";

export async function POST(request: Request): Promise<Response> {
  try {
    const body = await request.json() as { email?: unknown; password?: unknown };
    if (typeof body.email !== "string" || typeof body.password !== "string") throw new Error("Укажите email и пароль.");
    if (!await consumeRateLimit(`login:${clientIp(request)}:${normalizeEmail(body.email)}`, 8, 15 * 60_000)) return Response.json({ error: "Слишком много попыток. Попробуйте позже." }, { status: 429 });
    const result = await login(body.email, body.password);
    return Response.json({ user: result.viewer }, { headers: { "Set-Cookie": cookieHeader(result.token) } });
  } catch (error) { return Response.json({ error: error instanceof Error ? error.message : "Не удалось войти." }, { status: 401 }); }
}
function clientIp(request: Request): string { return request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "local"; }
