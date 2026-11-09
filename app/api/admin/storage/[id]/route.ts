import { changeStoredAssetExpiry, manuallyDeleteStoredAsset } from "../../../../../src/lib/admin-file-retention.ts";
import { isDenied, requireAdmin } from "../../../../../src/lib/request-auth.ts";

export const dynamic = "force-dynamic";

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }): Promise<Response> {
  const admin = await requireAdmin(request); if (isDenied(admin)) return admin;
  try {
    const { id } = await context.params;
    const body = await request.json() as { expiresAt?: unknown };
    if (typeof body.expiresAt !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(body.expiresAt)) throw new Error("Укажите дату хранения.");
    const expiresAt = new Date(`${body.expiresAt}T23:59:59.999`);
    await changeStoredAssetExpiry({ id, actorUserId: admin.id, expiresAt });
    return Response.json({ ok: true, expiresAt: expiresAt.toISOString() });
  } catch (error) { return Response.json({ error: error instanceof Error ? error.message : "Не удалось изменить срок хранения." }, { status: 400 }); }
}

export async function DELETE(request: Request, context: { params: Promise<{ id: string }> }): Promise<Response> {
  const admin = await requireAdmin(request); if (isDenied(admin)) return admin;
  try {
    const { id } = await context.params;
    const body = await request.json() as { reason?: unknown };
    if (typeof body.reason !== "string") throw new Error("Укажите причину удаления.");
    await manuallyDeleteStoredAsset({ id, actorUserId: admin.id, reason: body.reason });
    return Response.json({ ok: true });
  } catch (error) { return Response.json({ error: error instanceof Error ? error.message : "Не удалось удалить файл." }, { status: 400 }); }
}
