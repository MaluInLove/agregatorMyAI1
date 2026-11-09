import { getDatabasePool } from "../../../../../src/lib/database";
import { getObjectStorage } from "../../../../../src/lib/object-storage";
import { isDenied, requireAdmin } from "../../../../../src/lib/request-auth";

export const dynamic = "force-dynamic";

export async function GET(request: Request, context: { params: Promise<{ id: string }> }): Promise<Response> {
  const admin = await requireAdmin(request); if (isDenied(admin)) return admin;
  const { id } = await context.params;
  const result = await getDatabasePool().query<{ storageKey: string; filename: string | null; mimeType: string }>(`SELECT storage_key AS "storageKey", original_filename AS filename, mime_type AS "mimeType" FROM media_assets WHERE id=$1 AND kind IN ('RESULT','WB_RESULT') AND deleted_at IS NULL`, [id]);
  const asset = result.rows[0];
  if (!asset) return new Response("Файл не найден.", { status: 404 });
  try {
    const storage = getObjectStorage();
    const url = await storage.signedDownloadUrl(asset.storageKey, { filename: asset.filename ?? "result", expiresInSeconds: 300 });
    if (url) return new Response(null, { status: 302, headers: { Location: url, "Cache-Control": "private, no-store", "Referrer-Policy": "no-referrer" } });
    const file = await storage.read(asset.storageKey);
    return new Response(new Uint8Array(file.body), { headers: { "Content-Type": asset.mimeType, "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(asset.filename ?? "result")}`, "Cache-Control": "private, no-store" } });
  } catch { return new Response("Файл отсутствует в локальном хранилище.", { status: 404 }); }
}
