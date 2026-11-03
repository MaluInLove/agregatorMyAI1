import { storeReference } from "../../../src/lib/reference-storage";
import { isDenied, requireAdmin } from "../../../src/lib/request-auth";

export const dynamic = "force-dynamic";

export async function POST(request: Request): Promise<Response> {
  const admin = await requireAdmin(request); if (isDenied(admin)) return admin;
  const formData = await request.formData();
  const file = formData.get("file");
  if (!(file instanceof File)) return Response.json({ error: "Нужен файл в поле file." }, { status: 400 });

  try {
    const stored = await storeReference({ buffer: Buffer.from(await file.arrayBuffer()), filename: file.name, mimeType: file.type });
    return Response.json(stored, { status: 201 });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Не удалось сохранить референс." }, { status: 400 });
  }
}
