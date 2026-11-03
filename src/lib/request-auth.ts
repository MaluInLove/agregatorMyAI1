import { tokenFromRequest, viewerFromToken, type Viewer } from "./auth.ts";

export async function requireAdmin(request: Request): Promise<Viewer | Response> {
  const viewer = await viewerFromToken(tokenFromRequest(request));
  return viewer?.role === "ADMIN" ? viewer : Response.json({ error: "Требуется вход администратора." }, { status: 403 });
}

export function isDenied(value: Viewer | Response): value is Response { return value instanceof Response; }
