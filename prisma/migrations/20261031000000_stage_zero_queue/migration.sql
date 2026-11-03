CREATE TYPE "GenerationKind" AS ENUM ('TEXT', 'IMAGE', 'VIDEO');
CREATE TYPE "GenerationStatus" AS ENUM ('DRAFT', 'QUEUED', 'SUBMITTED', 'PROCESSING', 'COMPLETED', 'FAILED', 'CANCELLED', 'BLOCKED', 'EXPIRED');
CREATE TYPE "MediaAssetKind" AS ENUM ('REFERENCE', 'RESULT', 'WB_RESULT');
CREATE TYPE "ProviderEventType" AS ENUM ('REQUEST', 'RESPONSE', 'STATUS', 'ERROR');

CREATE TABLE "model_configs" (
    "id" TEXT NOT NULL,
    "display_name" TEXT NOT NULL,
    "technical_model_id" TEXT NOT NULL,
    "generation_kind" "GenerationKind" NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "allowed_parameters" JSONB NOT NULL DEFAULT '{}'::jsonb,
    "provider_configuration" JSONB NOT NULL DEFAULT '{}'::jsonb,
    "long_running_after_seconds" INTEGER,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "model_configs_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "model_configs_technical_model_id_key" UNIQUE ("technical_model_id"),
    CONSTRAINT "model_configs_long_running_after_seconds_check" CHECK ("long_running_after_seconds" IS NULL OR "long_running_after_seconds" > 0)
);

CREATE TABLE "generation_jobs" (
    "id" TEXT NOT NULL,
    "user_id" TEXT,
    "model_config_id" TEXT NOT NULL,
    "generation_kind" "GenerationKind" NOT NULL,
    "status" "GenerationStatus" NOT NULL DEFAULT 'DRAFT',
    "prompt" TEXT NOT NULL,
    "parameters" JSONB NOT NULL DEFAULT '{}'::jsonb,
    "correlation_id" TEXT NOT NULL,
    "idempotency_key" TEXT NOT NULL,
    "provider_name" TEXT,
    "provider_job_id" TEXT,
    "attempt_count" INTEGER NOT NULL DEFAULT 0,
    "max_attempts" INTEGER NOT NULL DEFAULT 3,
    "available_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "last_attempt_at" TIMESTAMPTZ,
    "next_retry_at" TIMESTAMPTZ,
    "lease_token" TEXT,
    "leased_at" TIMESTAMPTZ,
    "lease_expires_at" TIMESTAMPTZ,
    "worker_instance_id" TEXT,
    "submitted_at" TIMESTAMPTZ,
    "processing_started_at" TIMESTAMPTZ,
    "completed_at" TIMESTAMPTZ,
    "failed_at" TIMESTAMPTZ,
    "last_error_code" TEXT,
    "last_error_message" TEXT,
    "last_error_details" JSONB,
    "actual_cost" NUMERIC(18, 6),
    "actual_cost_currency" TEXT,
    "actual_cost_details" JSONB,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "generation_jobs_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "generation_jobs_correlation_id_key" UNIQUE ("correlation_id"),
    CONSTRAINT "generation_jobs_idempotency_key_key" UNIQUE ("idempotency_key"),
    CONSTRAINT "generation_jobs_attempt_count_check" CHECK ("attempt_count" >= 0),
    CONSTRAINT "generation_jobs_max_attempts_check" CHECK ("max_attempts" > 0),
    CONSTRAINT "generation_jobs_actual_cost_check" CHECK ("actual_cost" IS NULL OR "actual_cost" >= 0),
    CONSTRAINT "generation_jobs_cost_currency_check" CHECK (("actual_cost" IS NULL) = ("actual_cost_currency" IS NULL))
);

CREATE TABLE "media_assets" (
    "id" TEXT NOT NULL,
    "user_id" TEXT,
    "generation_job_id" TEXT,
    "kind" "MediaAssetKind" NOT NULL,
    "storage_key" TEXT NOT NULL,
    "original_filename" TEXT,
    "mime_type" TEXT NOT NULL,
    "byte_size" BIGINT NOT NULL,
    "metadata" JSONB NOT NULL DEFAULT '{}'::jsonb,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expires_at" TIMESTAMPTZ,
    "deleted_at" TIMESTAMPTZ,
    CONSTRAINT "media_assets_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "media_assets_storage_key_key" UNIQUE ("storage_key"),
    CONSTRAINT "media_assets_byte_size_check" CHECK ("byte_size" >= 0)
);

CREATE TABLE "provider_events" (
    "id" TEXT NOT NULL,
    "generation_job_id" TEXT NOT NULL,
    "event_type" "ProviderEventType" NOT NULL,
    "provider_name" TEXT,
    "http_status" INTEGER,
    "correlation_id" TEXT NOT NULL,
    "payload" JSONB NOT NULL DEFAULT '{}'::jsonb,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "provider_events_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "audit_log" (
    "id" TEXT NOT NULL,
    "actor_user_id" TEXT,
    "action" TEXT NOT NULL,
    "target_type" TEXT NOT NULL,
    "target_id" TEXT,
    "correlation_id" TEXT,
    "details" JSONB NOT NULL DEFAULT '{}'::jsonb,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "audit_log_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "worker_heartbeats" (
    "instance_id" TEXT NOT NULL,
    "started_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "last_seen_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "metadata" JSONB NOT NULL DEFAULT '{}'::jsonb,
    CONSTRAINT "worker_heartbeats_pkey" PRIMARY KEY ("instance_id")
);

ALTER TABLE "generation_jobs" ADD CONSTRAINT "generation_jobs_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "generation_jobs" ADD CONSTRAINT "generation_jobs_model_config_id_fkey" FOREIGN KEY ("model_config_id") REFERENCES "model_configs"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "media_assets" ADD CONSTRAINT "media_assets_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "media_assets" ADD CONSTRAINT "media_assets_generation_job_id_fkey" FOREIGN KEY ("generation_job_id") REFERENCES "generation_jobs"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "provider_events" ADD CONSTRAINT "provider_events_generation_job_id_fkey" FOREIGN KEY ("generation_job_id") REFERENCES "generation_jobs"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "audit_log" ADD CONSTRAINT "audit_log_actor_user_id_fkey" FOREIGN KEY ("actor_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE INDEX "generation_jobs_queue_idx" ON "generation_jobs" ("available_at", "created_at") WHERE "status" = 'QUEUED';
CREATE INDEX "generation_jobs_status_idx" ON "generation_jobs" ("status", "updated_at");
CREATE INDEX "generation_jobs_user_id_idx" ON "generation_jobs" ("user_id", "created_at");
CREATE INDEX "media_assets_user_id_idx" ON "media_assets" ("user_id", "created_at");
CREATE INDEX "media_assets_expiration_idx" ON "media_assets" ("expires_at") WHERE "deleted_at" IS NULL;
CREATE INDEX "provider_events_generation_job_id_idx" ON "provider_events" ("generation_job_id", "created_at");
CREATE INDEX "audit_log_actor_user_id_idx" ON "audit_log" ("actor_user_id", "created_at");
CREATE INDEX "worker_heartbeats_last_seen_at_idx" ON "worker_heartbeats" ("last_seen_at");

CREATE OR REPLACE FUNCTION set_updated_at() RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER model_configs_set_updated_at BEFORE UPDATE ON "model_configs" FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER generation_jobs_set_updated_at BEFORE UPDATE ON "generation_jobs" FOR EACH ROW EXECUTE FUNCTION set_updated_at();
