import { randomUUID } from "node:crypto";
import { getDatabasePool } from "./database.ts";
import { getObjectStorage } from "./object-storage.ts";

const BATCH_SIZE = 100;

/**
 * Deletes expired object bytes but deliberately retains the media_assets row.
 * Repeated runs are safe: object deletion is idempotent and a row is marked
 * only after its object has been removed successfully.
 */
export async function expireStoredAssets(limit = BATCH_SIZE): Promise<number> {
  const database = getDatabasePool();
  const assets = await database.query<{ id: string; storageKey: string; expiresAt: Date }>(
    `SELECT id,storage_key AS "storageKey",expires_at AS "expiresAt"
     FROM media_assets
     WHERE deleted_at IS NULL AND expires_at IS NOT NULL AND expires_at <= CURRENT_TIMESTAMP
     ORDER BY expires_at ASC
     LIMIT $1`,
    [Math.max(1, Math.min(limit, BATCH_SIZE))],
  );

  let expired = 0;
  const storage = getObjectStorage();
  for (const asset of assets.rows) {
    await storage.remove(asset.storageKey);
    const result = await database.query(
      `UPDATE media_assets
       SET deleted_at=CURRENT_TIMESTAMP,
           metadata=metadata || jsonb_build_object('retentionExpiredAt', CURRENT_TIMESTAMP)
       WHERE id=$1 AND deleted_at IS NULL`,
      [asset.id],
    );
    if (!result.rowCount) continue;
    expired += 1;
    await database.query(
      `INSERT INTO audit_log (id,actor_user_id,action,target_type,target_id,details)
       VALUES ($1,NULL,'FILE_RETENTION_EXPIRED','media_asset',$2,$3::jsonb)`,
      [randomUUID(), asset.id, JSON.stringify({ expiresAt: asset.expiresAt.toISOString() })],
    );
  }
  return expired;
}
