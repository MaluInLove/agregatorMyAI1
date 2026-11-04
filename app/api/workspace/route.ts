import { isDenied, requireViewer } from "../../../src/lib/request-auth.ts";
import { appendChatMessage, createChat, createProject, getWorkspaceData, updateChat, updateProject, updateWorkspaceTheme } from "../../../src/lib/workspace.ts";

export const dynamic = "force-dynamic";

export async function GET(request: Request): Promise<Response> {
  const viewer = await requireViewer(request); if (isDenied(viewer)) return viewer;
  return Response.json(await getWorkspaceData(viewer.id));
}

export async function POST(request: Request): Promise<Response> {
  const viewer = await requireViewer(request); if (isDenied(viewer)) return viewer;
  try {
    const body = await request.json() as { action?: string; name?: string; title?: string; chatId?: string; projectId?: string | null; content?: string; color?: string; workspaceKind?: string };
    if (body.action === "project") return Response.json(await createProject(viewer.id, body.name ?? "", body.color), { status: 201 });
    if (body.action === "chat") return Response.json(await createChat(viewer.id, body), { status: 201 });
    if (body.action === "message") { await appendChatMessage(viewer.id, body.chatId ?? "", body.content ?? ""); return Response.json({ ok: true }); }
    return Response.json({ error: "Неизвестное действие." }, { status: 400 });
  } catch (error) { return Response.json({ error: error instanceof Error ? error.message : "Не удалось сохранить." }, { status: 400 }); }
}

export async function PATCH(request: Request): Promise<Response> {
  const viewer = await requireViewer(request); if (isDenied(viewer)) return viewer;
  try { const body = await request.json() as { theme?: unknown; scope?: string; action?: string; id?: string; title?: string; projectId?: string | null; color?: string }; if (body.scope === "chat" && body.id && body.action) { await updateChat(viewer.id, { id: body.id, action: body.action, title: body.title, projectId: body.projectId }); return Response.json({ ok: true }); } if (body.scope === "project" && body.id && body.action) { await updateProject(viewer.id, { id: body.id, action: body.action, name: body.title, color: body.color }); return Response.json({ ok: true }); } return Response.json({ theme: await updateWorkspaceTheme(viewer.id, body.theme) }); }
  catch (error) { return Response.json({ error: error instanceof Error ? error.message : "Не удалось сохранить тему." }, { status: 400 }); }
}
