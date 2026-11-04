import { readFile } from "node:fs/promises";
import path from "node:path";
import { getDatabasePool } from "../../../../../src/lib/database.ts";
import { getStoragePath } from "../../../../../src/lib/environment.ts";
import { isDenied, requireViewer } from "../../../../../src/lib/request-auth.ts";

export const dynamic = "force-dynamic";

export async function GET(request: Request, context: { params: Promise<{ id: string }> }): Promise<Response> {
  const viewer = await requireViewer(request); if (isDenied(viewer)) return viewer;
  const { id } = await context.params;
  const result = await getDatabasePool().query<{ storageKey: string; mimeType: string; originalFilename: string | null }>(
    `SELECT storage_key AS "storageKey",mime_type AS "mimeType",original_filename AS "originalFilename" FROM media_assets WHERE id=$1 AND kind='REFERENCE' AND deleted_at IS NULL AND user_id=$2`, [id, viewer.id],
  );
  const asset = result.rows[0];
  if (!asset) return Response.json({ error: "Файл не найден." }, { status: 404 });
  try {
    const file = await readFile(path.join(getStoragePath(), ...asset.storageKey.split("/")));
    return new Response(file, { headers: { "Content-Type": asset.mimeType, "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(asset.originalFilename ?? "reference")}`, "Cache-Control": "private, no-store" } });
  } catch { return Response.json({ error: "Файл больше недоступен." }, { status: 410 }); }
}
