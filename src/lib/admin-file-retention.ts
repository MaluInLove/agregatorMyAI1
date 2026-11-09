import { randomUUID } from "node:crypto";
import { getDatabasePool } from "./database.ts";
import { getObjectStorage } from "./object-storage.ts";

export type StoredAssetForAdmin = {
  id: string;
  kind: "REFERENCE" | "RESULT" | "WB_RESULT";
  filename: string | null;
  mimeType: string;
  byteSize: number;
  createdAt: string;
  expiresAt: string | null;
  deletedAt: string | null;
  user: string;
  model: string | null;
};

export async function listStoredAssetsForAdmin(): Promise<StoredAssetForAdmin[]> {
  const result = await getDatabasePool().query<{
    id: string; kind: StoredAssetForAdmin["kind"]; filename: string | null; mimeType: string; byteSize: string;
    createdAt: Date; expiresAt: Date | null; deletedAt: Date | null; user: string | null; model: string | null;
  }>(`SELECT a.id,a.kind::text AS kind,a.original_filename AS filename,a.mime_type AS "mimeType",a.byte_size::text AS "byteSize",
            a.created_at AS "createdAt",a.expires_at AS "expiresAt",a.deleted_at AS "deletedAt",
            COALESCE(u.display_name,u.email,'Стенд / система') AS user,c.display_name AS model
     FROM media_assets a
     LEFT JOIN users u ON u.id=a.user_id
     LEFT JOIN generation_jobs j ON j.id=a.generation_job_id
     LEFT JOIN model_configs c ON c.id=j.model_config_id
     ORDER BY a.deleted_at NULLS FIRST,a.created_at DESC
     LIMIT 200`);
  return result.rows.map((asset) => ({
    ...asset,
    byteSize: Number(asset.byteSize),
    user: asset.user ?? "Стенд / система",
    createdAt: asset.createdAt.toISOString(),
    expiresAt: asset.expiresAt?.toISOString() ?? null,
    deletedAt: asset.deletedAt?.toISOString() ?? null,
  }));
}

export async function changeStoredAssetExpiry(input: { id: string; actorUserId: string; expiresAt: Date }): Promise<void> {
  if (!Number.isFinite(input.expiresAt.getTime()) || input.expiresAt.getTime() < Date.now() - 60_000) throw new Error("Укажите дату хранения начиная с сегодняшнего дня.");
  const database = getDatabasePool();
  const result = await database.query<{ previous: Date | null }>(
    `UPDATE media_assets SET expires_at=$1
     WHERE id=$2 AND deleted_at IS NULL
     RETURNING expires_at AS previous`,
    [input.expiresAt, input.id],
  );
  if (!result.rowCount) throw new Error("Файл не найден или уже удалён.");
  await database.query(
    `INSERT INTO audit_log (id,actor_user_id,action,target_type,target_id,details)
     VALUES ($1,$2,'FILE_RETENTION_CHANGED','media_asset',$3,$4::jsonb)`,
    [randomUUID(), input.actorUserId, input.id, JSON.stringify({ expiresAt: input.expiresAt.toISOString() })],
  );
}

export async function manuallyDeleteStoredAsset(input: { id: string; actorUserId: string; reason: string }): Promise<void> {
  const reason = input.reason.trim();
  if (reason.length < 3 || reason.length > 500) throw new Error("Укажите причину удаления от 3 до 500 символов.");
  const database = getDatabasePool();
  const asset = await database.query<{ storageKey: string; kind: string; filename: string | null }>(
    `SELECT storage_key AS "storageKey",kind::text AS kind,original_filename AS filename
     FROM media_assets
     WHERE id=$1 AND deleted_at IS NULL AND kind IN ('RESULT','WB_RESULT')`,
    [input.id],
  );
  if (!asset.rowCount) throw new Error("Файл не найден или уже удалён.");
  await getObjectStorage().remove(asset.rows[0].storageKey);
  const marked = await database.query(
    `UPDATE media_assets SET deleted_at=CURRENT_TIMESTAMP,
       metadata=metadata || jsonb_build_object('manualDeletionAt', CURRENT_TIMESTAMP)
     WHERE id=$1 AND deleted_at IS NULL`,
    [input.id],
  );
  if (!marked.rowCount) throw new Error("Файл уже был удалён другим действием.");
  await database.query(
    `INSERT INTO audit_log (id,actor_user_id,action,target_type,target_id,details)
     VALUES ($1,$2,'FILE_MANUALLY_DELETED','media_asset',$3,$4::jsonb)`,
    [randomUUID(), input.actorUserId, input.id, JSON.stringify({ reason, kind: asset.rows[0].kind, filename: asset.rows[0].filename })],
  );
}
