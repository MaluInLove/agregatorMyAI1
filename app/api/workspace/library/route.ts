import { getDatabasePool } from "../../../../src/lib/database.ts";
import { isDenied, requireViewer } from "../../../../src/lib/request-auth.ts";

export const dynamic = "force-dynamic";

export async function GET(request: Request): Promise<Response> {
  const viewer = await requireViewer(request); if (isDenied(viewer)) return viewer;
  const db = getDatabasePool();
  const [references, generated] = await Promise.all([
    db.query(`SELECT id,original_filename AS "originalFilename",mime_type AS "mimeType",byte_size::text AS "byteSize",created_at AS "createdAt" FROM media_assets WHERE user_id=$1 AND kind='REFERENCE' AND deleted_at IS NULL ORDER BY created_at DESC LIMIT 40`, [viewer.id]),
    db.query(`SELECT a.id,a.original_filename AS "originalFilename",a.mime_type AS "mimeType",a.byte_size::text AS "byteSize",a.created_at AS "createdAt" FROM media_assets a LEFT JOIN generation_jobs j ON j.id=a.generation_job_id WHERE a.kind IN ('RESULT','WB_RESULT') AND a.deleted_at IS NULL AND (a.user_id=$1 OR j.user_id=$1) ORDER BY a.created_at DESC LIMIT 40`, [viewer.id]),
  ]);
  return Response.json({ references: references.rows, generated: generated.rows });
}
