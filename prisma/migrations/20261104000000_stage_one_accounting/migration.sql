CREATE TYPE "InvitationStatus" AS ENUM ('PENDING', 'USED', 'REVOKED', 'EXPIRED');
CREATE TYPE "AccessPeriodStatus" AS ENUM ('ACTIVE', 'EXPIRED', 'REVOKED');
CREATE TYPE "CreditReservationStatus" AS ENUM ('HELD', 'RELEASED', 'CHARGED');
CREATE TYPE "CreditLedgerKind" AS ENUM ('GRANT', 'ADJUSTMENT', 'DEBIT', 'CHARGE', 'REFUND');
CREATE TYPE "TariffStatus" AS ENUM ('ACTIVE', 'RETIRED');
CREATE TYPE "MarginEventLevel" AS ENUM ('WARNING', 'BLOCKED');

ALTER TABLE "users" ADD COLUMN "display_name" TEXT, ADD COLUMN "is_blocked" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "generation_jobs" ADD COLUMN "tariff_version_id" TEXT, ADD COLUMN "tariff_snapshot" JSONB,
  ADD COLUMN "credit_price" NUMERIC(18,4), ADD COLUMN "credit_currency" TEXT;

CREATE TABLE "invitations" (
  "id" TEXT PRIMARY KEY, "email" TEXT NOT NULL, "display_name" TEXT, "token_hash" TEXT NOT NULL UNIQUE,
  "status" "InvitationStatus" NOT NULL DEFAULT 'PENDING', "expires_at" TIMESTAMPTZ NOT NULL,
  "used_at" TIMESTAMPTZ, "revoked_at" TIMESTAMPTZ, "created_by_user_id" TEXT NOT NULL,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY ("created_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT
);
CREATE INDEX "invitations_email_status_idx" ON "invitations" ("email", "status");
CREATE INDEX "invitations_expires_at_idx" ON "invitations" ("expires_at");

CREATE TABLE "access_periods" (
  "id" TEXT PRIMARY KEY, "user_id" TEXT NOT NULL, "starts_at" TIMESTAMPTZ NOT NULL, "ends_at" TIMESTAMPTZ NOT NULL,
  "status" "AccessPeriodStatus" NOT NULL DEFAULT 'ACTIVE', "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CHECK ("ends_at" > "starts_at"), FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT
);
CREATE INDEX "access_periods_user_window_idx" ON "access_periods" ("user_id", "starts_at", "ends_at");

CREATE TABLE "credit_ledger" (
  "id" TEXT PRIMARY KEY, "user_id" TEXT NOT NULL, "amount" NUMERIC(18,4) NOT NULL, "kind" "CreditLedgerKind" NOT NULL,
  "reason" TEXT NOT NULL, "generation_job_id" TEXT, "actor_user_id" TEXT, "metadata" JSONB NOT NULL DEFAULT '{}'::jsonb,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CHECK ("amount" <> 0), FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT
);
CREATE INDEX "credit_ledger_user_created_idx" ON "credit_ledger" ("user_id", "created_at");
CREATE INDEX "credit_ledger_job_idx" ON "credit_ledger" ("generation_job_id");
REVOKE UPDATE, DELETE ON "credit_ledger" FROM PUBLIC;

CREATE TABLE "credit_reservations" (
  "id" TEXT PRIMARY KEY, "user_id" TEXT NOT NULL, "generation_job_id" TEXT NOT NULL UNIQUE,
  "amount" NUMERIC(18,4) NOT NULL, "status" "CreditReservationStatus" NOT NULL DEFAULT 'HELD',
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP, "settled_at" TIMESTAMPTZ, "reason" TEXT NOT NULL,
  CHECK ("amount" > 0), FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT,
  FOREIGN KEY ("generation_job_id") REFERENCES "generation_jobs"("id") ON DELETE RESTRICT
);
CREATE INDEX "credit_reservations_user_status_idx" ON "credit_reservations" ("user_id", "status");

CREATE TABLE "tariff_versions" (
  "id" TEXT PRIMARY KEY, "model_config_id" TEXT NOT NULL, "parameter_key" JSONB NOT NULL, "parameter_hash" TEXT NOT NULL,
  "version" INTEGER NOT NULL, "status" "TariffStatus" NOT NULL DEFAULT 'ACTIVE',
  "credit_price" NUMERIC(18,4) NOT NULL, "currency" TEXT NOT NULL DEFAULT 'CREDIT',
  "max_external_cost" NUMERIC(18,6) NOT NULL, "external_currency" TEXT NOT NULL DEFAULT 'RUB',
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP, "retired_at" TIMESTAMPTZ,
  CHECK ("version" > 0), CHECK ("credit_price" >= 0), CHECK ("max_external_cost" > 0),
  UNIQUE ("model_config_id", "parameter_hash", "version"),
  FOREIGN KEY ("model_config_id") REFERENCES "model_configs"("id") ON DELETE RESTRICT
);
CREATE INDEX "tariff_versions_lookup_idx" ON "tariff_versions" ("model_config_id", "parameter_hash", "status");
CREATE UNIQUE INDEX "tariff_versions_one_active_idx" ON "tariff_versions" ("model_config_id", "parameter_hash") WHERE "status" = 'ACTIVE';

CREATE TABLE "projects" (
  "id" TEXT PRIMARY KEY, "user_id" TEXT NOT NULL, "name" TEXT NOT NULL, "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP, FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT
);
CREATE INDEX "projects_user_updated_idx" ON "projects" ("user_id", "updated_at");
CREATE TABLE "chats" (
  "id" TEXT PRIMARY KEY, "user_id" TEXT NOT NULL, "project_id" TEXT, "title" TEXT NOT NULL,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP, "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT,
  FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE SET NULL
);
CREATE INDEX "chats_user_updated_idx" ON "chats" ("user_id", "updated_at");
CREATE TABLE "chat_messages" (
  "id" TEXT PRIMARY KEY, "chat_id" TEXT NOT NULL, "user_id" TEXT NOT NULL, "role" TEXT NOT NULL, "content" TEXT NOT NULL,
  "generation_job_id" TEXT, "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY ("chat_id") REFERENCES "chats"("id") ON DELETE RESTRICT,
  FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT
);
CREATE INDEX "chat_messages_chat_created_idx" ON "chat_messages" ("chat_id", "created_at");

CREATE TABLE "service_settings" ("key" TEXT PRIMARY KEY, "value" JSONB NOT NULL, "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP);
CREATE TABLE "margin_events" (
  "id" TEXT PRIMARY KEY, "generation_job_id" TEXT NOT NULL, "level" "MarginEventLevel" NOT NULL,
  "actual_cost" NUMERIC(18,6), "ceiling" NUMERIC(18,6) NOT NULL, "details" JSONB NOT NULL DEFAULT '{}'::jsonb,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY ("generation_job_id") REFERENCES "generation_jobs"("id") ON DELETE RESTRICT
);
CREATE INDEX "margin_events_level_created_idx" ON "margin_events" ("level", "created_at");
CREATE INDEX "margin_events_job_idx" ON "margin_events" ("generation_job_id");
CREATE INDEX "generation_jobs_tariff_idx" ON "generation_jobs" ("tariff_version_id");

CREATE TRIGGER projects_set_updated_at BEFORE UPDATE ON "projects" FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER chats_set_updated_at BEFORE UPDATE ON "chats" FOR EACH ROW EXECUTE FUNCTION set_updated_at();
