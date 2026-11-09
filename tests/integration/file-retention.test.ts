import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { rm } from "node:fs/promises";
import test, { after } from "node:test";
import { closeDatabasePool, getDatabasePool } from "../../src/lib/database.ts";
import { getStoragePath } from "../../src/lib/environment.ts";
import { expireStoredAssets } from "../../src/lib/file-retention.ts";
import { getObjectStorage, resetObjectStorageForTests } from "../../src/lib/object-storage.ts";

const expiredId = randomUUID(); const activeId = randomUUID();
const expiredKey = `task10-retention/${expiredId}.txt`; const activeKey = `task10-retention/${activeId}.txt`;

test("очистка по сроку удаляет байты, но сохраняет историю и аудит", async () => {
  resetObjectStorageForTests();
  const database = getDatabasePool(); const storage = getObjectStorage();
  await storage.put(expiredKey, Buffer.from("expired"), "text/plain");
  await storage.put(activeKey, Buffer.from("active"), "text/plain");
  await database.query(
    `INSERT INTO media_assets (id,kind,storage_key,original_filename,mime_type,byte_size,expires_at)
     VALUES ($1,'RESULT',$2,'expired.txt','text/plain',7,CURRENT_TIMESTAMP - INTERVAL '1 minute'),
            ($3,'RESULT',$4,'active.txt','text/plain',6,CURRENT_TIMESTAMP + INTERVAL '1 day')`,
    [expiredId, expiredKey, activeId, activeKey],
  );
  assert.equal(await expireStoredAssets(), 1);
  assert.equal(await storage.exists(expiredKey), false);
  assert.equal(await storage.exists(activeKey), true);
  const [assets, audit] = await Promise.all([
    database.query<{ id: string; deletedAt: Date | null; retentionExpiredAt: string | null }>(`SELECT id,deleted_at AS "deletedAt",metadata->>'retentionExpiredAt' AS "retentionExpiredAt" FROM media_assets WHERE id=ANY($1::text[]) ORDER BY id`, [[activeId, expiredId]]),
    database.query<{ count: string }>(`SELECT COUNT(*)::text AS count FROM audit_log WHERE action='FILE_RETENTION_EXPIRED' AND target_id=$1`, [expiredId]),
  ]);
  const expired = assets.rows.find((asset) => asset.id === expiredId); const active = assets.rows.find((asset) => asset.id === activeId);
  assert.ok(expired?.deletedAt);
  assert.ok(expired?.retentionExpiredAt);
  assert.equal(active?.deletedAt, null);
  assert.equal(audit.rows[0]?.count, "1");
  assert.equal(await expireStoredAssets(), 0, "Повторная очистка не должна повторно удалять историю.");
});

after(async () => {
  const database = getDatabasePool(); const storage = getObjectStorage();
  await storage.remove(activeKey);
  await database.query("DELETE FROM audit_log WHERE target_id=ANY($1::text[])", [[expiredId, activeId]]);
  await database.query("DELETE FROM media_assets WHERE id=ANY($1::text[])", [[expiredId, activeId]]);
  const testStoragePath = getStoragePath();
  if (!testStoragePath.includes(`${pathSeparator()}var${pathSeparator()}test-storage${pathSeparator()}run-`)) throw new Error("Отказ очистки: неожиданная тестовая папка хранения.");
  await rm(testStoragePath, { recursive: true, force: true });
  await closeDatabasePool();
});

function pathSeparator(): string { return process.platform === "win32" ? "\\" : "/"; }
