import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test, { after } from "node:test";
import { createTariffVersion, creditBalance, findActiveTariff } from "../../src/lib/billing.ts";
import { closeDatabasePool, getDatabasePool } from "../../src/lib/database.ts";
import { cancelQueuedJob, enqueueUserGenerationJob, releaseJobReservation } from "../../src/lib/queue.ts";

type Fixture = { userId: string; modelId: string; parameters: Record<string, unknown> };
const fixtures: Fixture[] = [];
const testPrefix = `task10-${randomUUID()}`;

async function fixture(creditPrice: number): Promise<Fixture> {
  const database = getDatabasePool(); const userId = randomUUID(); const modelId = `${testPrefix}-${randomUUID()}`; const accessId = randomUUID();
  await database.query(`INSERT INTO users (id,email,password_hash,role,display_name,updated_at) VALUES ($1,$2,$3,'USER',$4,CURRENT_TIMESTAMP)`, [userId, `${userId}@task10.test`, "not-used-by-tests", "Тестовый ученик"]);
  await database.query(`INSERT INTO access_periods (id,user_id,starts_at,ends_at,status) VALUES ($1,$2,CURRENT_TIMESTAMP - INTERVAL '1 hour',CURRENT_TIMESTAMP + INTERVAL '1 day','ACTIVE')`, [accessId, userId]);
  await database.query(`INSERT INTO credit_ledger (id,user_id,amount,kind,reason) VALUES ($1,$2,10,'GRANT','Тестовый стартовый пакет')`, [randomUUID(), userId]);
  await database.query(`INSERT INTO model_configs (id,display_name,technical_model_id,generation_kind,is_active,allowed_parameters,provider_configuration) VALUES ($1,$2,$3,'TEXT',true,'{}'::jsonb,'{}'::jsonb)`, [modelId, "Тестовая модель", `test/${modelId}`]);
  const parameters = { maxOutputTokens: 400 };
  await createTariffVersion({ modelConfigId: modelId, parameters, creditPrice, maxExternalCost: 0.1 });
  const value = { userId, modelId, parameters }; fixtures.push(value); return value;
}

function enqueue(input: Fixture) {
  return enqueueUserGenerationJob({ userId: input.userId, modelConfigId: input.modelId, generationKind: "TEXT", prompt: "Проверка очереди", parameters: input.parameters });
}

async function availableBalance(userId: string): Promise<number> {
  const client = await getDatabasePool().connect();
  try { return await creditBalance(client, userId); }
  finally { client.release(); }
}

test("параллельные запуски не резервируют больше доступного баланса", async () => {
  const input = await fixture(7);
  const attempts = await Promise.allSettled([enqueue(input), enqueue(input)]);
  assert.equal(attempts.filter((attempt) => attempt.status === "fulfilled").length, 1);
  assert.equal(attempts.filter((attempt) => attempt.status === "rejected").length, 1);
  const reservations = await getDatabasePool().query<{ count: string; amount: string }>(`SELECT COUNT(*)::text AS count,COALESCE(SUM(amount),0)::text AS amount FROM credit_reservations WHERE user_id=$1 AND status='HELD'`, [input.userId]);
  assert.deepEqual(reservations.rows[0], { count: "1", amount: "7.0000" });
  assert.equal(await availableBalance(input.userId), 3);
});

test("отмена до захвата worker освобождает бронь без окончательного списания", async () => {
  const input = await fixture(7); const job = await enqueue(input);
  assert.equal(await cancelQueuedJob(job.id), true);
  await releaseJobReservation(job.id, "Тестовая отмена до захвата worker");
  const database = getDatabasePool();
  const [jobState, reservation, charges] = await Promise.all([
    database.query<{ status: string }>("SELECT status::text AS status FROM generation_jobs WHERE id=$1", [job.id]),
    database.query<{ status: string }>("SELECT status::text AS status FROM credit_reservations WHERE generation_job_id=$1", [job.id]),
    database.query<{ count: string }>("SELECT COUNT(*)::text AS count FROM credit_ledger WHERE generation_job_id=$1 AND kind='CHARGE'", [job.id]),
  ]);
  assert.equal(jobState.rows[0]?.status, "CANCELLED");
  assert.equal(reservation.rows[0]?.status, "RELEASED");
  assert.equal(charges.rows[0]?.count, "0");
  assert.equal(await availableBalance(input.userId), 10);
});

test("новая версия тарифа не меняет снимок уже созданной задачи", async () => {
  const input = await fixture(7); const job = await enqueue(input);
  const nextTariff = await createTariffVersion({ modelConfigId: input.modelId, parameters: input.parameters, creditPrice: 9, maxExternalCost: 0.2 });
  const snapshot = await getDatabasePool().query<{ price: string; snapshot: { creditPrice?: number } }>(`SELECT credit_price::text AS price,tariff_snapshot AS snapshot FROM generation_jobs WHERE id=$1`, [job.id]);
  assert.equal(snapshot.rows[0]?.price, "7.0000");
  assert.equal(snapshot.rows[0]?.snapshot.creditPrice, 7);
  assert.equal(nextTariff.version, 2);
  assert.equal((await findActiveTariff(input.modelId, input.parameters))?.creditPrice, 9);
});

after(async () => {
  const database = getDatabasePool(); const userIds = fixtures.map((item) => item.userId); const modelIds = fixtures.map((item) => item.modelId);
  if (userIds.length) {
    await database.query("DELETE FROM margin_events WHERE generation_job_id IN (SELECT id FROM generation_jobs WHERE user_id=ANY($1::text[]))", [userIds]);
    await database.query("DELETE FROM provider_events WHERE generation_job_id IN (SELECT id FROM generation_jobs WHERE user_id=ANY($1::text[]))", [userIds]);
    await database.query("DELETE FROM media_assets WHERE user_id=ANY($1::text[])", [userIds]);
    await database.query("DELETE FROM credit_reservations WHERE user_id=ANY($1::text[])", [userIds]);
    await database.query("DELETE FROM credit_ledger WHERE user_id=ANY($1::text[])", [userIds]);
    await database.query("DELETE FROM generation_jobs WHERE user_id=ANY($1::text[])", [userIds]);
    await database.query("DELETE FROM access_periods WHERE user_id=ANY($1::text[])", [userIds]);
    await database.query("DELETE FROM audit_log WHERE actor_user_id=ANY($1::text[])", [userIds]);
    await database.query("DELETE FROM users WHERE id=ANY($1::text[])", [userIds]);
  }
  if (modelIds.length) await database.query("DELETE FROM tariff_versions WHERE model_config_id=ANY($1::text[])", [modelIds]);
  if (modelIds.length) await database.query("DELETE FROM model_configs WHERE id=ANY($1::text[])", [modelIds]);
  await closeDatabasePool();
});
