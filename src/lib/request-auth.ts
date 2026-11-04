import { tokenFromRequest, viewerFromToken, type Viewer } from "./auth.ts";

export async function requireAdmin(request: Request): Promise<Viewer | Response> {
  const viewer = await viewerFromToken(tokenFromRequest(request));
  return viewer?.role === "ADMIN" ? viewer : Response.json({ error: "Требуется вход администратора." }, { status: 403 });
}

export async function requireViewer(request: Request): Promise<Viewer | Response> {
  const viewer = await viewerFromToken(tokenFromRequest(request));
  return viewer ?? Response.json({ error: "Требуется вход в аккаунт." }, { status: 401 });
}

export function isDenied(value: Viewer | Response): value is Response { return value instanceof Response; }
