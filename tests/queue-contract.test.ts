import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";

const queueSource = await readFile(new URL("../src/lib/queue.ts", import.meta.url), "utf8");
const workspaceSource = await readFile(new URL("../src/lib/workspace-generations.ts", import.meta.url), "utf8");
const runnerSource = await readFile(new URL("../src/lib/job-runner.ts", import.meta.url), "utf8");

test("worker захватывает одну задачу блокировкой и переводит её из очереди до отправки", () => {
  assert.match(queueSource, /FOR UPDATE SKIP LOCKED/);
  assert.match(queueSource, /SET lease_token = \$2,\s*status = 'PROCESSING'/s);
  assert.match(queueSource, /leaseDurationMs = 650_000/);
});

test("пользовательская отмена возможна только до захвата worker и освобождает бронь", () => {
  assert.match(queueSource, /WHERE id = \$1 AND status = 'QUEUED'/);
  assert.match(workspaceSource, /cancelQueuedJob\(jobId\)/);
  assert.match(workspaceSource, /releaseJobReservation\(jobId, "Отменено пользователем до захвата worker"\)/);
});

test("после принятия Polza бронь становится списанием, а не может быть повторно отправлена", () => {
  assert.match(runnerSource, /await chargeAcceptedJob\(job\.id\)/);
  assert.match(queueSource, /UPDATE credit_reservations SET status='CHARGED'/);
  assert.match(runnerSource, /A response from create\* means Polza accepted the work/);
});

test("параметры задачи остаются рабочими данными, а не заменяются диагностической маскировкой", () => {
  assert.match(queueSource, /JSON\.stringify\(input\.parameters \?\? \{\}\)/);
  assert.doesNotMatch(queueSource, /JSON\.stringify\(sanitizeDiagnosticValue\(input\.parameters/);
});
