import { activateInvitation, consumeRateLimit, cookieHeader, enterWithEmergencyInvitation, login } from "../../../../src/lib/auth.ts";

export async function POST(request: Request): Promise<Response> {
  try {
    const body = await request.json() as { token?: unknown; password?: unknown; emergencyLogin?: unknown };
    if (typeof body.token !== "string") throw new Error("Нужна ссылка приглашения.");
    const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "local";
    if (!await consumeRateLimit(`activate:${ip}`, 10, 60 * 60_000)) return Response.json({ error: "Слишком много попыток. Попробуйте позже." }, { status: 429 });
    if (body.emergencyLogin === true) {
      const session = await enterWithEmergencyInvitation(body.token);
      return Response.json({ user: session.viewer }, { headers: { "Set-Cookie": cookieHeader(session.token) } });
    }
    if (typeof body.password !== "string") throw new Error("Задайте пароль.");
    const user = await activateInvitation({ token: body.token, password: body.password });
    const session = await login(user.email, body.password);
    return Response.json({ user }, { status: 201, headers: { "Set-Cookie": cookieHeader(session.token) } });
  } catch (error) { return Response.json({ error: error instanceof Error ? error.message : "Не удалось активировать приглашение." }, { status: 400 }); }
}
