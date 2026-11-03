import { createAdministrator, tokenFromRequest, viewerFromToken } from "../../../../src/lib/auth.ts";
export async function POST(request: Request): Promise<Response> {
  try { const actor = await viewerFromToken(tokenFromRequest(request)); if (!actor || actor.role !== "ADMIN") return Response.json({ error: "Недостаточно прав." }, { status: 403 });
    const body = await request.json() as { email?: unknown; password?: unknown; displayName?: unknown }; if (typeof body.email !== "string" || typeof body.password !== "string" || (body.displayName !== undefined && typeof body.displayName !== "string")) throw new Error("Укажите email, пароль и корректное имя.");
    return Response.json({ user: await createAdministrator(actor, { email: body.email, password: body.password, displayName: body.displayName }) }, { status: 201 });
  } catch (error) { return Response.json({ error: error instanceof Error ? error.message : "Не удалось создать администратора." }, { status: 400 }); }
}
