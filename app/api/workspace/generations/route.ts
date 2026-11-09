import { isDenied, requireViewer } from "../../../../src/lib/request-auth.ts";
import { cancelWorkspaceGeneration, createWorkspaceGeneration, workspaceGenerationOptions } from "../../../../src/lib/workspace-generations.ts";

export const dynamic = "force-dynamic";
export async function GET(request: Request): Promise<Response> { const viewer = await requireViewer(request); if (isDenied(viewer)) return viewer; return Response.json(await workspaceGenerationOptions(viewer.id)); }
export async function POST(request: Request): Promise<Response> { const viewer = await requireViewer(request); if (isDenied(viewer)) return viewer; try { return Response.json(await createWorkspaceGeneration(viewer.id, await request.json()), { status: 202 }); } catch (error) { return Response.json({ error: error instanceof Error ? error.message : "Не удалось создать генерацию." }, { status: 400 }); } }
export async function DELETE(request: Request): Promise<Response> { const viewer = await requireViewer(request); if (isDenied(viewer)) return viewer; try { const body = await request.json() as { jobId?: string }; if (!body.jobId) throw new Error("Не указана задача."); await cancelWorkspaceGeneration(viewer.id, body.jobId); return Response.json({ ok: true }); } catch (error) { return Response.json({ error: error instanceof Error ? error.message : "Не удалось отменить задачу." }, { status: 400 }); } }
