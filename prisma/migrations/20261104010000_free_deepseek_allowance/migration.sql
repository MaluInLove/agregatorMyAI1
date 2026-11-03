CREATE TABLE IF NOT EXISTS "free_text_allowances" (
  "id" TEXT PRIMARY KEY, "user_id" TEXT NOT NULL UNIQUE, "access_period_id" TEXT NOT NULL UNIQUE,
  "total_limit" INTEGER NOT NULL DEFAULT 250, "used_count" INTEGER NOT NULL DEFAULT 0,
  "daily_limit" INTEGER NOT NULL DEFAULT 20, "day_starts_at" DATE NOT NULL,
  "day_used_count" INTEGER NOT NULL DEFAULT 0, "max_external_budget" NUMERIC(18,6) NOT NULL DEFAULT 20,
  "reserved_external_budget" NUMERIC(18,6) NOT NULL DEFAULT 0,
  CHECK ("total_limit" >= 0 AND "used_count" >= 0 AND "daily_limit" > 0 AND "day_used_count" >= 0),
  CHECK ("max_external_budget" >= 0 AND "reserved_external_budget" >= 0),
  FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT,
  FOREIGN KEY ("access_period_id") REFERENCES "access_periods"("id") ON DELETE RESTRICT
);
