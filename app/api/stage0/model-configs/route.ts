import { listModelConfigurations, setModelConfiguration, type ModelConfiguration } from "../../../../src/lib/model-configs";
import { isDenied, requireAdmin } from "../../../../src/lib/request-auth";

export const dynamic = "force-dynamic";

export async function GET(request: Request): Promise<Response> {
  const admin = await requireAdmin(request); if (isDenied(admin)) return admin;
  return Response.json(await listModelConfigurations());
}

export async function PUT(request: Request): Promise<Response> {
  const admin = await requireAdmin(request); if (isDenied(admin)) return admin;
  try {
    const configuration = await request.json() as ModelConfiguration;
    if (!configuration || typeof configuration.id !== "string") {
      return Response.json({ error: "Нужна полная конфигурация модели с полем id." }, { status: 400 });
    }
    await setModelConfiguration(configuration);
    return new Response(null, { status: 204 });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Не удалось сохранить конфигурацию." }, { status: 400 });
  }
}
