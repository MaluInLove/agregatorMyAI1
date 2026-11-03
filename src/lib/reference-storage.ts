import { randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { getDatabasePool } from "./database.ts";
import { getStoragePath } from "./environment.ts";

const MAX_REFERENCE_BYTES = 50 * 1024 * 1024;
const allowedMimeTypes = new Set(["image/png", "image/jpeg", "image/webp", "video/mp4", "video/quicktime", "video/webm"]);

export interface StoredReference {
  id: string;
  storageKey: string;
  mimeType: string;
  byteSize: number;
  originalFilename: string;
}

export async function storeReference(input: { buffer: Buffer; filename: string; mimeType: string; userId?: string }): Promise<StoredReference> {
  if (!allowedMimeTypes.has(input.mimeType)) throw new Error("Неподдерживаемый тип референса.");
  if (input.buffer.length === 0 || input.buffer.length > MAX_REFERENCE_BYTES) throw new Error("Размер референса должен быть от 1 байта до 50 МБ.");

  const extension = extensionForMimeType(input.mimeType);
  const id = randomUUID();
  const storageKey = path.posix.join("references", `${id}${extension}`);
  const absolutePath = path.join(getStoragePath(), ...storageKey.split("/"));
  await mkdir(path.dirname(absolutePath), { recursive: true });
  await writeFile(absolutePath, input.buffer, { flag: "wx" });
  await getDatabasePool().query(
    `INSERT INTO media_assets (id, user_id, kind, storage_key, original_filename, mime_type, byte_size, metadata)
     VALUES ($1, $2, 'REFERENCE', $3, $4, $5, $6, $7::jsonb)`,
    [id, input.userId ?? null, storageKey, safeFilename(input.filename), input.mimeType, input.buffer.length, JSON.stringify({ source: "local" })],
  );
  return { id, storageKey, mimeType: input.mimeType, byteSize: input.buffer.length, originalFilename: safeFilename(input.filename) };
}

function extensionForMimeType(mimeType: string): string {
  return { "image/png": ".png", "image/jpeg": ".jpg", "image/webp": ".webp", "video/mp4": ".mp4", "video/quicktime": ".mov", "video/webm": ".webm" }[mimeType] ?? "";
}

function safeFilename(filename: string): string {
  return path.basename(filename).replace(/[\0\r\n]/g, "_").slice(0, 255) || "reference";
}
