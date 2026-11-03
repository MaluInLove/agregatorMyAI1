import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { SESSION_COOKIE, viewerFromToken } from "../../../src/lib/auth";
import { listInvitations } from "../../../src/lib/auth";
import { AccessManager } from "./access-manager";
export default async function AccessPage() { const viewer = await viewerFromToken((await cookies()).get(SESSION_COOKIE)?.value); if (!viewer || viewer.role !== "ADMIN") redirect("/login"); return <AccessManager initialInvitations={await listInvitations(viewer)} />; }
