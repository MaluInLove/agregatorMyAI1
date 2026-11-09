import {
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { mkdir, readFile, stat, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { getStoragePath } from "./environment.ts";

export type ObjectStorageDriver = "local" | "s3";

export interface StoredObject {
  body: Buffer;
  contentType?: string;
  byteSize: number;
}

export interface ObjectStorage {
  readonly driver: ObjectStorageDriver;
  put(key: string, body: Uint8Array, contentType: string): Promise<void>;
  read(key: string): Promise<StoredObject>;
  exists(key: string): Promise<boolean>;
  remove(key: string): Promise<void>;
  signedDownloadUrl(key: string, input?: { filename?: string; inline?: boolean; expiresInSeconds?: number }): Promise<string | null>;
}

let cachedStorage: ObjectStorage | undefined;

/**
 * Uses local files by default. Set OBJECT_STORAGE_DRIVER=s3 only when every
 * S3_* variable is configured; this keeps local development independent from
 * MinIO or an external provider.
 */
export function getObjectStorage(): ObjectStorage {
  if (!cachedStorage) cachedStorage = createObjectStorage();
  return cachedStorage;
}

// Exported for isolated tests and for a process that deliberately changes its
// storage configuration before starting work.
export function resetObjectStorageForTests(): void {
  cachedStorage = undefined;
}

function createObjectStorage(): ObjectStorage {
  const driver = (process.env.OBJECT_STORAGE_DRIVER ?? "local").trim().toLowerCase();
  if (driver === "local") return new LocalObjectStorage(getStoragePath());
  if (driver !== "s3") throw new Error("OBJECT_STORAGE_DRIVER должен быть local или s3.");

  const bucket = required("S3_BUCKET");
  const accessKeyId = required("S3_ACCESS_KEY_ID");
  const secretAccessKey = required("S3_SECRET_ACCESS_KEY");
  const endpoint = optionalUrl("S3_ENDPOINT");
  const region = process.env.S3_REGION?.trim() || "us-east-1";
  const prefix = normalizePrefix(process.env.S3_PREFIX);
  const client = new S3Client({
    region,
    endpoint,
    forcePathStyle: process.env.S3_FORCE_PATH_STYLE !== "false",
    credentials: { accessKeyId, secretAccessKey },
  });
  return new S3ObjectStorage(client, bucket, prefix);
}

class LocalObjectStorage implements ObjectStorage {
  readonly driver = "local" as const;

  constructor(private readonly root: string) {}

  async put(key: string, body: Uint8Array): Promise<void> {
    const target = this.pathFor(key);
    await mkdir(path.dirname(target), { recursive: true });
    await writeFile(target, body);
  }

  async read(key: string): Promise<StoredObject> {
    const target = this.pathFor(key);
    const [body, info] = await Promise.all([readFile(target), stat(target)]);
    return { body, byteSize: info.size };
  }

  async exists(key: string): Promise<boolean> {
    try {
      await stat(this.pathFor(key));
      return true;
    } catch (error) {
      if (isNotFound(error)) return false;
      throw error;
    }
  }

  async remove(key: string): Promise<void> {
    try {
      await unlink(this.pathFor(key));
    } catch (error) {
      if (!isNotFound(error)) throw error;
    }
  }

  async signedDownloadUrl(): Promise<string | null> {
    // Local files stay behind the authenticated application route. The route
    // is the local equivalent of a short-lived S3 URL and never exposes a path.
    return null;
  }

  private pathFor(key: string): string {
    const normalized = normalizeKey(key);
    const target = path.resolve(this.root, ...normalized.split("/"));
    const root = path.resolve(this.root);
    if (target !== root && !target.startsWith(`${root}${path.sep}`)) throw new Error("Некорректный ключ файла.");
    return target;
  }
}

class S3ObjectStorage implements ObjectStorage {
  readonly driver = "s3" as const;

  constructor(private readonly client: S3Client, private readonly bucket: string, private readonly prefix: string) {}

  async put(key: string, body: Uint8Array, contentType: string): Promise<void> {
    await this.client.send(new PutObjectCommand({ Bucket: this.bucket, Key: this.keyFor(key), Body: body, ContentType: contentType }));
  }

  async read(key: string): Promise<StoredObject> {
    const object = await this.client.send(new GetObjectCommand({ Bucket: this.bucket, Key: this.keyFor(key) }));
    if (!object.Body) throw new Error("Объектное хранилище вернуло пустой файл.");
    const body = Buffer.from(await object.Body.transformToByteArray());
    return { body, byteSize: Number(object.ContentLength ?? body.length), contentType: object.ContentType };
  }

  async exists(key: string): Promise<boolean> {
    try {
      await this.client.send(new HeadObjectCommand({ Bucket: this.bucket, Key: this.keyFor(key) }));
      return true;
    } catch (error) {
      if (isNotFound(error)) return false;
      throw error;
    }
  }

  async remove(key: string): Promise<void> {
    await this.client.send(new DeleteObjectCommand({ Bucket: this.bucket, Key: this.keyFor(key) }));
  }

  async signedDownloadUrl(key: string, input: { filename?: string; inline?: boolean; expiresInSeconds?: number } = {}): Promise<string> {
    const expiresIn = Math.max(60, Math.min(input.expiresInSeconds ?? 300, 3600));
    const disposition = input.filename
      ? `${input.inline ? "inline" : "attachment"}; filename*=UTF-8''${encodeURIComponent(safeFilename(input.filename))}`
      : undefined;
    return getSignedUrl(this.client, new GetObjectCommand({
      Bucket: this.bucket,
      Key: this.keyFor(key),
      ResponseContentDisposition: disposition,
    }), { expiresIn });
  }

  private keyFor(key: string): string {
    const normalized = normalizeKey(key);
    return this.prefix ? `${this.prefix}/${normalized}` : normalized;
  }
}

function normalizeKey(key: string): string {
  const normalized = key.replaceAll("\\", "/").replace(/^\/+/, "");
  if (!normalized || normalized.split("/").some((part) => !part || part === "." || part === "..")) throw new Error("Некорректный ключ файла.");
  return normalized;
}

function normalizePrefix(value: string | undefined): string {
  const prefix = (value ?? "").trim().replaceAll("\\", "/").replace(/^\/+|\/+$/g, "");
  return prefix ? normalizeKey(prefix) : "";
}

function required(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`Для S3-хранилища требуется ${name}.`);
  return value;
}

function optionalUrl(name: string): string | undefined {
  const value = process.env[name]?.trim();
  if (!value) return undefined;
  try { return new URL(value).toString(); }
  catch { throw new Error(`${name} должен быть корректным URL.`); }
}

function safeFilename(value: string): string {
  return path.basename(value).replace(/[\0\r\n]/g, "_").slice(0, 255) || "file";
}

function isNotFound(error: unknown): boolean {
  if (typeof error !== "object" || error === null) return false;
  const candidate = error as { code?: string; name?: string; $metadata?: { httpStatusCode?: number } };
  return candidate.code === "ENOENT" || candidate.name === "NotFound" || candidate.name === "NoSuchKey" || candidate.$metadata?.httpStatusCode === 404;
}
