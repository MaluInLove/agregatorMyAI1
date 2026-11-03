import { changeOwnPassword, tokenFromRequest, viewerFromToken } from "../../../../src/lib/auth.ts";
export async function POST(request: Request): Promise<Response> {
  try { const viewer = await viewerFromToken(tokenFromRequest(request)); if (!viewer) return Response.json({ error: "Требуется вход." }, { status: 401 });
    const body = await request.json() as { currentPassword?: unknown; password?: unknown }; if (typeof body.currentPassword !== "string" || typeof body.password !== "string") throw new Error("Укажите текущий и новый пароль.");
    await changeOwnPassword(viewer, body.currentPassword, body.password); return Response.json({ ok: true });
  } catch (error) { return Response.json({ error: error instanceof Error ? error.message : "Не удалось изменить пароль." }, { status: 400 }); }
}
