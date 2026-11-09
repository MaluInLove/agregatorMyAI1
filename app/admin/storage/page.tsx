import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { listStoredAssetsForAdmin } from "../../../src/lib/admin-file-retention.ts";
import { SESSION_COOKIE, viewerFromToken } from "../../../src/lib/auth.ts";
import { AdminNav } from "../admin-nav";
import { StorageManager } from "./storage-manager";

export const dynamic = "force-dynamic";

export default async function Page() {
  const viewer = await viewerFromToken((await cookies()).get(SESSION_COOKIE)?.value);
  if (!viewer || viewer.role !== "ADMIN") redirect("/login");
  const assets = await listStoredAssetsForAdmin();
  return <main className="admin-page"><section className="admin-shell"><header className="admin-header"><div><p className="eyebrow">Файлы и результаты</p><h1>Хранение файлов</h1><p>По умолчанию файлы хранятся 90 дней. История задач остаётся после удаления байтов.</p></div><AdminNav /></header><StorageManager initialAssets={assets} /></section></main>;
}
