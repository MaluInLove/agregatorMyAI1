import { createInvitation, listInvitations, tokenFromRequest, viewerFromToken } from "../../../../src/lib/auth.ts";
export async function GET(request: Request): Promise<Response> {
  const actor = await viewerFromToken(tokenFromRequest(request)); if (!actor || actor.role !== "ADMIN") return Response.json({ error: "Недостаточно прав." }, { status: 403 });
  return Response.json({ invitations: await listInvitations(actor) });
}
export async function POST(request: Request): Promise<Response> {
  try { const actor = await viewerFromToken(tokenFromRequest(request)); if (!actor || actor.role !== "ADMIN") return Response.json({ error: "Недостаточно прав." }, { status: 403 });
    const body = await request.json() as { email?: unknown; displayName?: unknown; emergency?: unknown; guest?: unknown; guestCredits?: unknown }; if (typeof body.email !== "string" || typeof body.displayName !== "string") throw new Error("Укажите имя и email.");
    const invitation = await createInvitation({ actor, email: body.email, displayName: body.displayName, emergency: body.emergency === true, guest: body.guest === true, guestCredits: typeof body.guestCredits === "number" ? body.guestCredits : undefined }); const base = process.env.APP_URL?.replace(/\/$/, "") ?? new URL(request.url).origin;
    return Response.json({ activationUrl: `${base}/activate?token=${encodeURIComponent(invitation.token)}`, expiresAt: invitation.expiresAt.toISOString() }, { status: 201 });
  } catch (error) { return Response.json({ error: error instanceof Error ? error.message : "Не удалось создать приглашение." }, { status: 400 }); }
}
