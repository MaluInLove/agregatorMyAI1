import { expiredCookieHeader, logout, tokenFromRequest } from "../../../../src/lib/auth.ts";
export async function POST(request: Request): Promise<Response> { await logout(tokenFromRequest(request)); return Response.json({ ok: true }, { headers: { "Set-Cookie": expiredCookieHeader() } }); }
