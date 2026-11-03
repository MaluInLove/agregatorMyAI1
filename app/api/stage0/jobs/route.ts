import { listModelConfigurations } from "../../../../src/lib/model-configs";
import { enqueueGenerationJob } from "../../../../src/lib/queue";
import { validateGenerationInput } from "../../../../src/lib/generation-validation";

export const dynamic = "force-dynamic";

export async function POST(request: Request): Promise<Response> {
  try {
    const body = await request.json() as { modelConfigId?: unknown; prompt?: unknown; parameters?: unknown };
    if (typeof body.modelConfigId !== "string" || typeof body.prompt !== "string" || !body.prompt.trim()) {
      return Response.json({ error: "Нужны modelConfigId и непустой prompt." }, { status: 400 });
    }
    const config = (await listModelConfigurations()).find((item) => item.id === body.modelConfigId);
    if (!config?.isActive) return Response.json({ error: "Модель выключена или не подтверждена." }, { status: 409 });
    const prompt = body.prompt.trim();
    const parameters = validateGenerationInput(config, prompt, body.parameters ?? {});
    const job = await enqueueGenerationJob({ modelConfigId: config.id, generationKind: config.generationKind, prompt, parameters });
    return Response.json(job, { status: 202 });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Не удалось поставить задачу в очередь." }, { status: 400 });
  }
}
