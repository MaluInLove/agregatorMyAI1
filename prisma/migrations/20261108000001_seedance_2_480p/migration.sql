-- Seedance 2 at 480p was manually verified in the learner workflow.
UPDATE "model_configs"
SET "allowed_parameters" = jsonb_set(
  COALESCE("allowed_parameters", '{}'::jsonb),
  '{resolution}',
  '["480p", "720p", "1080p"]'::jsonb,
  true
)
WHERE "id" = 'video-seedance-2';

INSERT INTO "tariff_versions" (
  "id", "model_config_id", "parameter_key", "parameter_hash", "version", "credit_price", "currency", "max_external_cost", "external_currency"
)
SELECT
  'tariff-video-seedance-2-480p-5s-v1',
  'video-seedance-2',
  '{"aspect_ratio":"3:4","duration":"5","generate_audio":false,"resolution":"480p"}'::jsonb,
  'b067865ebc82684d04c6427d05d966705b7d03a8f98d9ef79d85f8a3e50e9d2a',
  1,
  75,
  'CREDIT',
  75,
  'RUB'
WHERE NOT EXISTS (
  SELECT 1 FROM "tariff_versions"
  WHERE "model_config_id" = 'video-seedance-2'
    AND "parameter_hash" = 'b067865ebc82684d04c6427d05d966705b7d03a8f98d9ef79d85f8a3e50e9d2a'
);
