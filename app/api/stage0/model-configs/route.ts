import { listModelConfigurations, setModelConfiguration, type ModelConfiguration } from "../../../../src/lib/model-configs";

export const dynamic = "force-dynamic";

export async function GET(): Promise<Response> {
  return Response.json(await listModelConfigurations());
}

export async function PUT(request: Request): Promise<Response> {
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
