import "dotenv/config";
import { createTariffVersion, findActiveTariff } from "../src/lib/billing.ts";
import { getDatabasePool, closeDatabasePool } from "../src/lib/database.ts";
import { INITIAL_ACCESS_SETTINGS, INITIAL_TARIFFS } from "../src/lib/stage-one-defaults.ts";

async function main(): Promise<void> {
  const pool = getDatabasePool();
  let created = 0;
  for (const tariff of INITIAL_TARIFFS) {
    const existing = await findActiveTariff(tariff.modelConfigId, tariff.parameters);
    if (!existing || existing.creditPrice !== tariff.creditPrice || existing.maxExternalCost !== tariff.maxExternalCost) { await createTariffVersion(tariff); created += 1; }
  }
  await pool.query(`INSERT INTO service_settings (key,value) VALUES ('initial_access',$1::jsonb) ON CONFLICT (key) DO NOTHING`, [JSON.stringify(INITIAL_ACCESS_SETTINGS)]);
  console.log(`[stage1] Added ${created} of ${INITIAL_TARIFFS.length} approved tariff versions.`);
}
main().finally(() => closeDatabasePool()).catch((error: unknown) => { console.error(error); process.exitCode = 1; });
