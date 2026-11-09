import { randomUUID } from "node:crypto";
import path from "node:path";
import { PDFDocument } from "pdf-lib";
import { getDatabasePool } from "./database.ts";
import { getObjectStorage } from "./object-storage.ts";

const MAX_REFERENCE_BYTES = 10 * 1024 * 1024;
const MAX_USER_REFERENCES = 20;
const allowedMimeTypes = new Set(["application/pdf", "image/png", "image/jpeg", "image/webp", "video/mp4", "video/quicktime", "video/webm"]);

export interface StoredReference {
  id: string;
  storageKey: string;
  mimeType: string;
  byteSize: number;
  originalFilename: string;
}

export async function storeReference(input: { buffer: Buffer; filename: string; mimeType: string; userId?: string }): Promise<StoredReference> {
  if (!allowedMimeTypes.has(input.mimeType)) throw new Error("Неподдерживаемый тип референса.");
  if (input.buffer.length === 0) throw new Error("Выберите непустой файл референса.");
  if (input.buffer.length > MAX_REFERENCE_BYTES) throw new Error("Файл слишком большой. Можно загрузить референс до 10 МБ.");
  if (!filenameMatchesMimeType(input.filename, input.mimeType)) throw new Error("Расширение файла не соответствует его типу.");
  if (input.mimeType === "application/pdf") await validatePdf(input.buffer);
  if (input.userId) {
    const count = await getDatabasePool().query<{ count: string }>(`SELECT COUNT(*)::text AS count FROM media_assets WHERE user_id=$1 AND kind='REFERENCE' AND deleted_at IS NULL`, [input.userId]);
    if (Number(count.rows[0]?.count ?? 0) >= MAX_USER_REFERENCES) throw new Error(`Можно хранить не более ${MAX_USER_REFERENCES} референсов.`);
  }

  const extension = extensionForMimeType(input.mimeType);
  const id = randomUUID();
  const storageKey = path.posix.join("references", `${id}${extension}`);
  await getObjectStorage().put(storageKey, input.buffer, input.mimeType);
  await getDatabasePool().query(
    `INSERT INTO media_assets (id, user_id, kind, storage_key, original_filename, mime_type, byte_size, metadata, expires_at)
     VALUES ($1, $2, 'REFERENCE', $3, $4, $5, $6, $7::jsonb, CURRENT_TIMESTAMP + INTERVAL '90 days')`,
    [id, input.userId ?? null, storageKey, safeFilename(input.filename), input.mimeType, input.buffer.length, JSON.stringify({ source: getObjectStorage().driver })],
  );
  return { id, storageKey, mimeType: input.mimeType, byteSize: input.buffer.length, originalFilename: safeFilename(input.filename) };
}

function extensionForMimeType(mimeType: string): string {
  return { "application/pdf": ".pdf", "image/png": ".png", "image/jpeg": ".jpg", "image/webp": ".webp", "video/mp4": ".mp4", "video/quicktime": ".mov", "video/webm": ".webm" }[mimeType] ?? "";
}

function filenameMatchesMimeType(filename: string, mimeType: string): boolean {
  const extension = path.extname(filename).toLowerCase();
  return ({ "application/pdf": [".pdf"], "image/png": [".png"], "image/jpeg": [".jpg", ".jpeg"], "image/webp": [".webp"], "video/mp4": [".mp4"], "video/quicktime": [".mov"], "video/webm": [".webm"] }[mimeType] ?? []).includes(extension);
}

async function validatePdf(buffer: Buffer): Promise<void> {
  let document: PDFDocument;
  try { document = await PDFDocument.load(buffer, { ignoreEncryption: false }); }
  catch { throw new Error("Не удалось прочитать PDF. Загрузите корректный файл."); }
  if (document.getPageCount() > 10) throw new Error("В ChatGPT можно загрузить PDF до 10 страниц.");
}

function safeFilename(filename: string): string {
  return path.basename(filename).replace(/[\0\r\n]/g, "_").slice(0, 255) || "reference";
}
