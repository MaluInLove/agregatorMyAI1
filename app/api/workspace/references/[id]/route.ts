import { getDatabasePool } from "../../../../../src/lib/database.ts";
import { isDenied, requireViewer } from "../../../../../src/lib/request-auth.ts";

export const dynamic = "force-dynamic";

export async function DELETE(request: Request, context: { params: Promise<{ id: string }> }): Promise<Response> {
  const viewer = await requireViewer(request); if (isDenied(viewer)) return viewer;
  const { id } = await context.params;
  const result = await getDatabasePool().query(
    `UPDATE media_assets SET deleted_at=CURRENT_TIMESTAMP
     WHERE id=$1 AND user_id=$2 AND kind='REFERENCE' AND deleted_at IS NULL`,
    [id, viewer.id],
  );
  if (!result.rowCount) return Response.json({ error: "Референс не найден." }, { status: 404 });
  return Response.json({ ok: true });
}
