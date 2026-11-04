import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { SESSION_COOKIE, viewerFromToken } from "../../src/lib/auth";
import { getWorkspaceData } from "../../src/lib/workspace";
import { Workspace } from "./workspace";

export const dynamic = "force-dynamic";

export default async function WorkspacePage() {
  const viewer = await viewerFromToken((await cookies()).get(SESSION_COOKIE)?.value);
  if (!viewer) redirect("/login");
  const data = await getWorkspaceData(viewer.id);
  return <Workspace viewer={{ displayName: viewer.displayName, isGuest: viewer.role === "GUEST", isAdmin: viewer.role === "ADMIN" }} initialData={data} />;
}
