ALTER TABLE "chats" ADD COLUMN "workspace_kind" TEXT NOT NULL DEFAULT 'TEXT';

UPDATE "chats"
SET "workspace_kind" = CASE
  WHEN lower("title") LIKE '%премиум%' THEN 'PREMIUM'
  WHEN lower("title") LIKE '%девушк%' THEN 'VIDEO'
  WHEN lower("title") LIKE '%картинк%' OR lower("title") LIKE '%изображен%' THEN 'IMAGE'
  WHEN lower("title") LIKE '%видео%' THEN 'VIDEO'
  ELSE 'TEXT'
END;
