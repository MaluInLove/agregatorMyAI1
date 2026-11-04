import { storeReference } from "../../../../src/lib/reference-storage.ts";
import { isDenied, requireViewer } from "../../../../src/lib/request-auth.ts";

export const dynamic = "force-dynamic";

export async function POST(request: Request): Promise<Response> {
  const viewer = await requireViewer(request); if (isDenied(viewer)) return viewer;
  const formData = await request.formData(); const file = formData.get("file");
  if (!(file instanceof File)) return Response.json({ error: "Выберите файл референса." }, { status: 400 });
  try { return Response.json(await storeReference({ buffer: Buffer.from(await file.arrayBuffer()), filename: file.name, mimeType: file.type, userId: viewer.id }), { status: 201 }); }
  catch (error) { return Response.json({ error: error instanceof Error ? error.message : "Не удалось сохранить референс." }, { status: 400 }); }
}
