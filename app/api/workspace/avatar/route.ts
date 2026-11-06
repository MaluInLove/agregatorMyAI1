import { readProfileAvatar, storeProfileAvatar } from "../../../../src/lib/profile-avatar.ts";
import { isDenied, requireViewer } from "../../../../src/lib/request-auth.ts";

export const dynamic = "force-dynamic";

export async function GET(request: Request): Promise<Response> {
  const viewer = await requireViewer(request); if (isDenied(viewer)) return viewer;
  const avatar = await readProfileAvatar(viewer.id);
  if (!avatar) return Response.json({ error: "Фотография не найдена." }, { status: 404 });
  return new Response(avatar.data, { headers: { "Content-Type": avatar.mimeType, "Cache-Control": "private, no-store" } });
}

export async function POST(request: Request): Promise<Response> {
  const viewer = await requireViewer(request); if (isDenied(viewer)) return viewer;
  try { const file = (await request.formData()).get("file"); if (!(file instanceof File)) throw new Error("Выберите фотографию."); return Response.json(await storeProfileAvatar({ userId: viewer.id, buffer: Buffer.from(await file.arrayBuffer()), mimeType: file.type }), { status: 201 }); }
  catch (error) { return Response.json({ error: error instanceof Error ? error.message : "Не удалось загрузить фотографию." }, { status: 400 }); }
}
