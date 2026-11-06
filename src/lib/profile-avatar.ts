import { randomUUID } from "node:crypto";
import { mkdir, readFile, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { getDatabasePool } from "./database.ts";
import { getStoragePath } from "./environment.ts";

const MAX_AVATAR_BYTES = 5 * 1024 * 1024;
const mimeExtensions = { "image/jpeg": ".jpg", "image/png": ".png", "image/webp": ".webp" } as const;

export async function storeProfileAvatar(input: { userId: string; buffer: Buffer; mimeType: string }) {
  const extension = mimeExtensions[input.mimeType as keyof typeof mimeExtensions];
  if (!extension) throw new Error("Поддерживаются фотографии JPEG, PNG или WEBP.");
  if (input.buffer.length === 0 || input.buffer.length > MAX_AVATAR_BYTES) throw new Error("Размер фотографии должен быть до 5 МБ.");
  const storageKey = path.posix.join("avatars", `${input.userId}-${randomUUID()}${extension}`);
  const target = path.join(getStoragePath(), ...storageKey.split("/"));
  await mkdir(path.dirname(target), { recursive: true });
  await writeFile(target, input.buffer, { flag: "wx" });
  const database = getDatabasePool();
  const existing = await database.query<{ oldKey: string | null }>(`SELECT avatar_storage_key AS "oldKey" FROM users WHERE id=$1`, [input.userId]);
  await database.query(`UPDATE users SET avatar_storage_key=$2,avatar_mime_type=$3 WHERE id=$1`, [input.userId, storageKey, input.mimeType]);
  const oldKey = existing.rows[0]?.oldKey;
  if (oldKey && oldKey !== storageKey) await unlink(path.join(getStoragePath(), ...oldKey.split("/"))).catch(() => undefined);
  return { storageKey, mimeType: input.mimeType };
}

export async function readProfileAvatar(userId: string) {
  const result = await getDatabasePool().query<{ storageKey: string; mimeType: string }>(`SELECT avatar_storage_key AS "storageKey",avatar_mime_type AS "mimeType" FROM users WHERE id=$1 AND avatar_storage_key IS NOT NULL AND avatar_mime_type IS NOT NULL`, [userId]);
  const avatar = result.rows[0];
  if (!avatar) return null;
  try { return { ...avatar, data: await readFile(path.join(getStoragePath(), ...avatar.storageKey.split("/"))) }; }
  catch { return null; }
}
