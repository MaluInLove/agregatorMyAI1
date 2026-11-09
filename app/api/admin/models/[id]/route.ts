import { randomUUID } from "node:crypto";
import { getDatabasePool } from "../../../../../src/lib/database.ts";
import { listModelConfigurations, setModelConfiguration, type ModelConfiguration } from "../../../../../src/lib/model-configs.ts";
import { isDenied, requireAdmin } from "../../../../../src/lib/request-auth.ts";

export const dynamic = "force-dynamic";

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }): Promise<Response> {
  const admin = await requireAdmin(request);
  if (isDenied(admin)) return admin;
  try {
    const { id } = await context.params;
    const body = await request.json() as { active?: unknown; configuration?: unknown };
    const configuration = (await listModelConfigurations()).find((model) => model.id === id);
    if (!configuration) return Response.json({ error: "Модель не найдена." }, { status: 404 });
    const next = body.configuration && typeof body.configuration === "object"
      ? { ...(body.configuration as ModelConfiguration), id }
      : typeof body.active === "boolean" ? { ...configuration, isActive: body.active } : null;
    if (!next) return Response.json({ error: "Укажите новое состояние или конфигурацию модели." }, { status: 400 });
    await setModelConfiguration(next);
    await getDatabasePool().query(
      `INSERT INTO audit_log (id, actor_user_id, action, target_type, target_id, details)
       VALUES ($1, $2, 'MODEL_STATUS_CHANGED', 'model_config', $3, $4::jsonb)`,
      [randomUUID(), admin.id, id, JSON.stringify({ displayName: next.displayName, isActive: next.isActive, configurationChanged: Boolean(body.configuration) })],
    );
    return Response.json({ id, active: next.isActive });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Не удалось изменить статус модели." }, { status: 400 });
  }
}
