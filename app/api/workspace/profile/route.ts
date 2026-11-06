import { isDenied, requireViewer } from "../../../../src/lib/request-auth.ts";
import { getDatabasePool } from "../../../../src/lib/database.ts";

export const dynamic = "force-dynamic";

export async function PATCH(request: Request): Promise<Response> {
  const viewer = await requireViewer(request); if (isDenied(viewer)) return viewer;
  try {
    const body = await request.json() as { displayName?: unknown };
    if (typeof body.displayName !== "string") throw new Error("Введите имя.");
    const displayName = body.displayName.trim().replace(/\s+/g, " ");
    if (displayName.length < 2 || displayName.length > 80) throw new Error("Имя должно быть от 2 до 80 символов.");
    await getDatabasePool().query(`UPDATE users SET display_name=$2 WHERE id=$1`, [viewer.id, displayName]);
    return Response.json({ displayName });
  }
  catch (error) { return Response.json({ error: error instanceof Error ? error.message : "Не удалось сохранить профиль." }, { status: 400 }); }
}
