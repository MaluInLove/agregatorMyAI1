ALTER TABLE "projects"
  ADD COLUMN "color" TEXT NOT NULL DEFAULT '#D1550D',
  ADD COLUMN "deleted_at" TIMESTAMPTZ;

ALTER TABLE "chats"
  ADD COLUMN "is_pinned" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "deleted_at" TIMESTAMPTZ;

CREATE INDEX "projects_user_active_updated_idx" ON "projects" ("user_id", "updated_at") WHERE "deleted_at" IS NULL;
CREATE INDEX "chats_user_active_pinned_updated_idx" ON "chats" ("user_id", "is_pinned" DESC, "updated_at" DESC) WHERE "deleted_at" IS NULL;
