import { tokenFromRequest, viewerFromToken } from "../../../../src/lib/auth.ts";
import { adjustUserCredits, extendUserAccess, listAdminUsers } from "../../../../src/lib/admin-users.ts";

async function actorFor(request: Request) { const actor = await viewerFromToken(tokenFromRequest(request)); if (!actor || actor.role !== "ADMIN") throw new Error("Недостаточно прав."); return actor; }
export async function GET(request: Request): Promise<Response> { try { return Response.json({ users: await listAdminUsers(await actorFor(request)) }); } catch (error) { return Response.json({ error: error instanceof Error ? error.message : "Не удалось получить пользователей." }, { status: 403 }); } }
export async function POST(request: Request): Promise<Response> {
  try {
    const actor = await actorFor(request); const body = await request.json() as { action?: unknown; userId?: unknown; amount?: unknown; days?: unknown; credits?: unknown; reason?: unknown };
    if (typeof body.userId !== "string" || typeof body.reason !== "string") throw new Error("Укажите пользователя и причину.");
    if (body.action === "credits" && typeof body.amount === "number") await adjustUserCredits(actor, { userId: body.userId, amount: body.amount, reason: body.reason });
    else if (body.action === "extend" && typeof body.days === "number" && (body.credits === undefined || typeof body.credits === "number")) await extendUserAccess(actor, { userId: body.userId, days: body.days, credits: body.credits, reason: body.reason });
    else throw new Error("Некорректная операция.");
    return Response.json({ ok: true });
  } catch (error) { return Response.json({ error: error instanceof Error ? error.message : "Не удалось выполнить операцию." }, { status: 400 }); }
}
