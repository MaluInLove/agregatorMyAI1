CREATE TABLE "admin_recovery_codes" (
  "id" TEXT PRIMARY KEY, "user_id" TEXT NOT NULL, "code_hash" TEXT NOT NULL UNIQUE,
  "used_at" TIMESTAMPTZ, "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT
);
CREATE INDEX "admin_recovery_codes_user_used_idx" ON "admin_recovery_codes" ("user_id", "used_at");
