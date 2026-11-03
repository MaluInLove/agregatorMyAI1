CREATE TABLE "auth_sessions" (
  "id" TEXT PRIMARY KEY, "user_id" TEXT NOT NULL, "token_hash" TEXT NOT NULL UNIQUE,
  "expires_at" TIMESTAMPTZ NOT NULL, "last_seen_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "revoked_at" TIMESTAMPTZ, "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT
);
CREATE INDEX "auth_sessions_user_expiry_idx" ON "auth_sessions" ("user_id", "expires_at");

CREATE TABLE "password_reset_tokens" (
  "id" TEXT PRIMARY KEY, "user_id" TEXT NOT NULL, "token_hash" TEXT NOT NULL UNIQUE,
  "expires_at" TIMESTAMPTZ NOT NULL, "used_at" TIMESTAMPTZ, "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT
);
CREATE INDEX "password_reset_tokens_user_expiry_idx" ON "password_reset_tokens" ("user_id", "expires_at");

CREATE TABLE "auth_rate_limits" (
  "key" TEXT PRIMARY KEY, "window_started_at" TIMESTAMPTZ NOT NULL, "attempts" INTEGER NOT NULL DEFAULT 0,
  CHECK ("attempts" >= 0)
);
