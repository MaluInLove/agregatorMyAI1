import { readFile, stat } from "node:fs/promises";
import path from "node:path";
import { getDatabasePool } from "../../../../../src/lib/database";
import { getStoragePath } from "../../../../../src/lib/environment";
import { isDenied, requireAdmin } from "../../../../../src/lib/request-auth";

export const dynamic = "force-dynamic";

export async function GET(request: Request, context: { params: Promise<{ id: string }> }): Promise<Response> {
  const admin = await requireAdmin(request); if (isDenied(admin)) return admin;
  const { id } = await context.params;
  const result = await getDatabasePool().query<{ storageKey: string; filename: string | null; mimeType: string }>(`SELECT storage_key AS "storageKey", original_filename AS filename, mime_type AS "mimeType" FROM media_assets WHERE id=$1 AND kind IN ('RESULT','WB_RESULT') AND deleted_at IS NULL`, [id]);
  const asset = result.rows[0];
  if (!asset) return new Response("Файл не найден.", { status: 404 });
  const root = getStoragePath(); const filePath = path.resolve(root, ...asset.storageKey.split("/"));
  if (!filePath.startsWith(`${root}${path.sep}`)) return new Response("Некорректный путь файла.", { status: 400 });
  try {
    await stat(filePath);
    return new Response(await readFile(filePath), { headers: { "Content-Type": asset.mimeType, "Content-Disposition": `attachment; filename="${path.basename(asset.filename ?? "result").replace(/[\r\n"]/g, "_")}"`, "Cache-Control": "no-store" } });
  } catch { return new Response("Файл отсутствует в локальном хранилище.", { status: 404 }); }
}
