import { setUserBlocked, tokenFromRequest, viewerFromToken } from "../../../../../../src/lib/auth.ts";
export async function POST(request: Request, context: { params: Promise<{ id: string }> }): Promise<Response> {
  try { const actor = await viewerFromToken(tokenFromRequest(request)); if (!actor || actor.role !== "ADMIN") return Response.json({ error: "Недостаточно прав." }, { status: 403 });
    const body = await request.json() as { blocked?: unknown; reason?: unknown }; if (typeof body.blocked !== "boolean" || typeof body.reason !== "string") throw new Error("Укажите статус и причину.");
    await setUserBlocked(actor, (await context.params).id, body.blocked, body.reason); return Response.json({ ok: true });
  } catch (error) { return Response.json({ error: error instanceof Error ? error.message : "Не удалось изменить блокировку." }, { status: 400 }); }
}
