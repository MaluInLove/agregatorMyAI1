-- Seedance and Wan can animate an uploaded image. Keep one source image per task
-- until multi-reference behaviour has been verified for the learner workflow.
UPDATE "model_configs"
SET "allowed_parameters" = jsonb_set(
  COALESCE("allowed_parameters", '{}'::jsonb),
  '{referenceImages}',
  '{"max": 1, "mimeTypes": ["image/png", "image/jpeg", "image/webp"]}'::jsonb,
  true
)
WHERE "id" IN ('video-seedance-2-mini', 'video-seedance-2', 'video-wan-3');
