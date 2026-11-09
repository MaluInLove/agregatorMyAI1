import { getDatabasePool } from "../../../../../src/lib/database.ts";
import { getObjectStorage } from "../../../../../src/lib/object-storage.ts";
import { isDenied, requireViewer } from "../../../../../src/lib/request-auth.ts";

export const dynamic = "force-dynamic";

export async function GET(request: Request, context: { params: Promise<{ id: string }> }): Promise<Response> {
  const viewer = await requireViewer(request); if (isDenied(viewer)) return viewer;
  const { id } = await context.params;
  const result = await getDatabasePool().query<{ storageKey: string; mimeType: string; originalFilename: string | null; kind: "REFERENCE" | "RESULT" | "WB_RESULT"; createdAt: Date; dailyReferenceNumber: string | null }>(
    `SELECT a.storage_key AS "storageKey",a.mime_type AS "mimeType",a.original_filename AS "originalFilename",a.kind::text AS kind,a.created_at AS "createdAt",
      CASE WHEN a.kind='REFERENCE' THEN (SELECT COUNT(*)::text FROM media_assets earlier WHERE earlier.user_id=a.user_id AND earlier.kind='REFERENCE' AND earlier.deleted_at IS NULL AND (earlier.created_at AT TIME ZONE 'Europe/Moscow')::date=(a.created_at AT TIME ZONE 'Europe/Moscow')::date AND (earlier.created_at<a.created_at OR (earlier.created_at=a.created_at AND earlier.id<=a.id))) END AS "dailyReferenceNumber"
      FROM media_assets a LEFT JOIN generation_jobs j ON j.id=a.generation_job_id
      WHERE a.id=$1 AND a.kind IN ('REFERENCE','RESULT','WB_RESULT') AND a.deleted_at IS NULL
        AND ($2='ADMIN' OR a.user_id=$3 OR j.user_id=$3)`, [id, viewer.role, viewer.id],
  );
  const asset = result.rows[0];
  if (!asset) {
    const expired = await getDatabasePool().query(
      `SELECT 1 FROM media_assets a LEFT JOIN generation_jobs j ON j.id=a.generation_job_id
       WHERE a.id=$1 AND a.deleted_at IS NOT NULL AND ($2='ADMIN' OR a.user_id=$3 OR j.user_id=$3)`,
      [id, viewer.role, viewer.id],
    );
    return expired.rowCount ? Response.json({ error: "Срок хранения файла завершён." }, { status: 410 }) : Response.json({ error: "Файл не найден." }, { status: 404 });
  }
  try {
    const preview = new URL(request.url).searchParams.get("preview") === "1";
    const extension = asset.originalFilename?.match(/\.[a-z0-9]{1,10}$/i)?.[0] ?? (asset.mimeType === "image/png" ? ".png" : asset.mimeType === "image/webp" ? ".webp" : asset.mimeType.startsWith("video/") ? ".mp4" : ".jpg");
    const referenceDate = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Moscow", year: "numeric", month: "2-digit", day: "2-digit" }).format(asset.createdAt).replaceAll("-", "");
    const filename = asset.kind === "REFERENCE" ? `reference_${referenceDate}_${String(Number(asset.dailyReferenceNumber ?? 1)).padStart(2, "0")}${extension}` : asset.originalFilename ?? "file";
    const storage = getObjectStorage();
    const url = await storage.signedDownloadUrl(asset.storageKey, { filename, inline: preview, expiresInSeconds: 300 });
    if (url) return new Response(null, { status: 302, headers: { Location: url, "Cache-Control": "private, no-store", "Referrer-Policy": "no-referrer" } });
    const file = await storage.read(asset.storageKey);
    return new Response(new Uint8Array(file.body), { headers: { "Content-Type": asset.mimeType, "Content-Disposition": `${preview ? "inline" : "attachment"}; filename*=UTF-8''${encodeURIComponent(filename)}`, "Cache-Control": "private, no-store" } });
  } catch { return Response.json({ error: "Файл больше недоступен." }, { status: 410 }); }
}
