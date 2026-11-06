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
    `SELECT a.storage_key AS "storageKey",a.mime_type AS "mimeType",a.original_filename AS "originalFilename" FROM media_assets a LEFT JOIN generation_jobs j ON j.id=a.generation_job_id WHERE a.id=$1 AND a.kind IN ('REFERENCE','RESULT','WB_RESULT') AND a.deleted_at IS NULL AND (a.user_id=$2 OR j.user_id=$2)`, [id, viewer.id],
  );
  const asset = result.rows[0];
  if (!asset) return Response.json({ error: "Файл не найден." }, { status: 404 });
  try {
    const file = await readFile(path.join(getStoragePath(), ...asset.storageKey.split("/")));
    return new Response(file, { headers: { "Content-Type": asset.mimeType, "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(asset.originalFilename ?? "reference")}`, "Cache-Control": "private, no-store" } });
  } catch { return Response.json({ error: "Файл больше недоступен." }, { status: 410 }); }
}
