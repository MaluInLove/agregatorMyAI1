import { createRecoveryCodes, tokenFromRequest, viewerFromToken } from "../../../../src/lib/auth.ts";
export async function POST(request: Request): Promise<Response> {
  try { const viewer = await viewerFromToken(tokenFromRequest(request)); if (!viewer || viewer.role !== "ADMIN") return Response.json({ error: "Недостаточно прав." }, { status: 403 });
    const body = await request.json() as { currentPassword?: unknown }; if (typeof body.currentPassword !== "string") throw new Error("Введите текущий пароль.");
    return Response.json({ codes: await createRecoveryCodes(viewer, body.currentPassword) });
  } catch (error) { return Response.json({ error: error instanceof Error ? error.message : "Не удалось создать коды." }, { status: 400 }); }
}
