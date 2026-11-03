import { revokeInvitation, tokenFromRequest, viewerFromToken } from "../../../../../src/lib/auth.ts";
export async function DELETE(request: Request, context: { params: Promise<{ id: string }> }): Promise<Response> {
  try { const actor = await viewerFromToken(tokenFromRequest(request)); if (!actor || actor.role !== "ADMIN") return Response.json({ error: "Недостаточно прав." }, { status: 403 });
    await revokeInvitation(actor, (await context.params).id); return Response.json({ ok: true });
  } catch (error) { return Response.json({ error: error instanceof Error ? error.message : "Не удалось отозвать приглашение." }, { status: 400 }); }
}
