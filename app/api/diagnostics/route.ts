import { getWorkerDiagnostics } from "../../../src/lib/diagnostics";
import { isDenied, requireAdmin } from "../../../src/lib/request-auth";

export const dynamic = "force-dynamic";

export async function GET(request: Request): Promise<Response> {
  const admin = await requireAdmin(request); if (isDenied(admin)) return admin;
  const diagnostics = await getWorkerDiagnostics();
  return Response.json(diagnostics, {
    headers: { "Cache-Control": "no-store" },
  });
}
