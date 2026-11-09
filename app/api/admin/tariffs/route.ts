import { randomUUID } from "node:crypto";
import { createTariffVersion } from "../../../../src/lib/billing.ts";
import { getDatabasePool } from "../../../../src/lib/database.ts";
import { isDenied, requireAdmin } from "../../../../src/lib/request-auth.ts";

export const dynamic = "force-dynamic";

export async function POST(request: Request): Promise<Response> {
  const admin = await requireAdmin(request);
  if (isDenied(admin)) return admin;
  try {
    const body = await request.json() as { modelConfigId?: unknown; parameters?: unknown; creditPrice?: unknown; maxExternalCost?: unknown };
    if (typeof body.modelConfigId !== "string") throw new Error("Выберите модель для тарифа.");
    const tariff = await createTariffVersion({ modelConfigId: body.modelConfigId, parameters: body.parameters, creditPrice: Number(body.creditPrice), maxExternalCost: Number(body.maxExternalCost) });
    await getDatabasePool().query(`INSERT INTO audit_log (id,actor_user_id,action,target_type,target_id,details) VALUES ($1,$2,'TARIFF_VERSION_CREATED','tariff_version',$3,$4::jsonb)`, [randomUUID(), admin.id, tariff.id, JSON.stringify({ modelConfigId: body.modelConfigId, version: tariff.version, parameters: tariff.parameterKey, creditPrice: tariff.creditPrice, maxExternalCost: tariff.maxExternalCost })]);
    return Response.json(tariff, { status: 201 });
  } catch (error) { return Response.json({ error: error instanceof Error ? error.message : "Не удалось создать версию тарифа." }, { status: 400 }); }
}
