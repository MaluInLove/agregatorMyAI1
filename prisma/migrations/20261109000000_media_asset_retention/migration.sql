ALTER TABLE "media_assets"
  ALTER COLUMN "expires_at" SET DEFAULT (CURRENT_TIMESTAMP + INTERVAL '90 days');

UPDATE "media_assets"
SET "expires_at" = "created_at" + INTERVAL '90 days'
WHERE "expires_at" IS NULL;
