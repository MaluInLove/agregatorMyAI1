import { mkdir } from "node:fs/promises";
import path from "node:path";

export function getStoragePath(): string {
  const configuredPath = process.env.LOCAL_STORAGE_PATH ?? "var/storage";
  return path.resolve(/* turbopackIgnore: true */ process.cwd(), configuredPath);
}

export async function ensureLocalStorage(): Promise<string> {
  const storagePath = getStoragePath();
  await mkdir(storagePath, { recursive: true });
  return storagePath;
}
