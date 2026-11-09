import assert from "node:assert/strict";
import { createHash, randomBytes, randomUUID } from "node:crypto";
import test, { after } from "node:test";
import { GET as adminUsers } from "../../app/api/admin/users/route.ts";
import { GET as workspaceAsset } from "../../app/api/workspace/assets/[id]/route.ts";
import { GET as workspaceGenerations } from "../../app/api/workspace/generations/route.ts";
import { SESSION_COOKIE } from "../../src/lib/auth.ts";
import { closeDatabasePool, getDatabasePool } from "../../src/lib/database.ts";
import { getWorkerDiagnostics } from "../../src/lib/diagnostics.ts";
import { getObjectStorage } from "../../src/lib/object-storage.ts";

const database = getDatabasePool();
const createdUserIds: string[] = [];
const createdAssetIds: string[] = [];
const createdStorageKeys: string[] = [];
const createdWorkerIds: string[] = [];

async function createSession(role: "ADMIN" | "USER"): Promise<{ userId: string; token: string }> {
  const userId = randomUUID(); const token = randomBytes(24).toString("base64url");
  createdUserIds.push(userId);
  await database.query(
    `INSERT INTO users (id,email,password_hash,role,display_name,updated_at)
     VALUES ($1,$2,'not-used-by-tests',$3::"UserRole",$4,CURRENT_TIMESTAMP)`,
    [userId, `${userId}@task10.test`, role, role === "ADMIN" ? "Тестовый администратор" : "Тестовый ученик"],
  );
  await database.query(
    `INSERT INTO auth_sessions (id,user_id,token_hash,expires_at)
     VALUES ($1,$2,$3,CURRENT_TIMESTAMP + INTERVAL '1 hour')`,
    [randomUUID(), userId, createHash("sha256").update(token).digest("hex")],
  );
  return { userId, token };
}

function request(url: string, token?: string): Request {
  return new Request(url, { headers: token ? { cookie: `${SESSION_COOKIE}=${token}` } : undefined });
}

test("защищённые маршруты требуют сессию, а административные — роль администратора", async () => {
  assert.equal((await workspaceGenerations(request("http://test.local/api/workspace/generations"))).status, 401);
  assert.equal((await adminUsers(request("http://test.local/api/admin/users"))).status, 403);

  const user = await createSession("USER");
  assert.equal((await adminUsers(request("http://test.local/api/admin/users", user.token))).status, 403);

  const admin = await createSession("ADMIN");
  const allowed = await adminUsers(request("http://test.local/api/admin/users", admin.token));
  assert.equal(allowed.status, 200);
  assert.ok(Array.isArray((await allowed.json() as { users: unknown[] }).users));
});

test("результат другого пользователя не скачивается, но доступен владельцу и администратору", async () => {
  const owner = await createSession("USER"); const other = await createSession("USER"); const admin = await createSession("ADMIN");
  const assetId = randomUUID(); const storageKey = `task10/access/${assetId}.txt`;
  createdAssetIds.push(assetId); createdStorageKeys.push(storageKey);
  await getObjectStorage().put(storageKey, Buffer.from("private test result"), "text/plain");
  await database.query(
    `INSERT INTO media_assets (id,user_id,kind,storage_key,original_filename,mime_type,byte_size,metadata)
     VALUES ($1,$2,'RESULT',$3,'private.txt','text/plain',19,'{}'::jsonb)`,
    [assetId, owner.userId, storageKey],
  );
  const context = { params: Promise.resolve({ id: assetId }) };
  assert.equal((await workspaceAsset(request(`http://test.local/api/workspace/assets/${assetId}`, other.token), context)).status, 404);
  const ownerResponse = await workspaceAsset(request(`http://test.local/api/workspace/assets/${assetId}`, owner.token), context);
  assert.equal(ownerResponse.status, 200);
  assert.equal(await ownerResponse.text(), "private test result");
  assert.equal((await workspaceAsset(request(`http://test.local/api/workspace/assets/${assetId}`, admin.token), context)).status, 200);
});

test("диагностика worker отличает устаревший heartbeat и не раскрывает его metadata", async () => {
  const liveId = `task10-live-${randomUUID()}`; const staleId = `task10-stale-${randomUUID()}`;
  createdWorkerIds.push(liveId, staleId);
  await database.query(
    `INSERT INTO worker_heartbeats (instance_id,last_seen_at,metadata) VALUES
     ($1,CURRENT_TIMESTAMP,'{"apiKey":"must-not-leak"}'::jsonb),
     ($2,CURRENT_TIMESTAMP - INTERVAL '4 minutes','{}'::jsonb)`,
    [liveId, staleId],
  );
  const data = await getWorkerDiagnostics();
  assert.equal(data.workers.find((worker) => worker.instanceId === liveId)?.healthy, true);
  assert.equal(data.workers.find((worker) => worker.instanceId === staleId)?.healthy, false);
  assert.equal(JSON.stringify(data).includes("must-not-leak"), false);
});

after(async () => {
  if (createdAssetIds.length) await database.query("DELETE FROM media_assets WHERE id=ANY($1::text[])", [createdAssetIds]);
  await Promise.all(createdStorageKeys.map((key) => getObjectStorage().remove(key)));
  if (createdWorkerIds.length) await database.query("DELETE FROM worker_heartbeats WHERE instance_id=ANY($1::text[])", [createdWorkerIds]);
  if (createdUserIds.length) {
    await database.query("DELETE FROM auth_sessions WHERE user_id=ANY($1::text[])", [createdUserIds]);
    await database.query("DELETE FROM audit_log WHERE actor_user_id=ANY($1::text[])", [createdUserIds]);
    await database.query("DELETE FROM users WHERE id=ANY($1::text[])", [createdUserIds]);
  }
  await closeDatabasePool();
});
