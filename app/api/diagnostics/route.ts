import { getWorkerDiagnostics } from "../../../src/lib/diagnostics";

export const dynamic = "force-dynamic";

export async function GET(): Promise<Response> {
  const diagnostics = await getWorkerDiagnostics();
  return Response.json(diagnostics, {
    headers: { "Cache-Control": "no-store" },
  });
}
