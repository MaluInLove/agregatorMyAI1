-- A manually checked, standard-quality Seedance 2 preset: 480p, 3:4, 8 seconds.
INSERT INTO "tariff_versions" (
  "id", "model_config_id", "parameter_key", "parameter_hash", "version", "credit_price", "currency", "max_external_cost", "external_currency"
)
SELECT
  'tariff-video-seedance-2-480p-8s-v1',
  'video-seedance-2',
  '{"aspect_ratio":"3:4","duration":"8","generate_audio":false,"resolution":"480p"}'::jsonb,
  '1e37e3b1fd93f5bf8658a06de77656d35e653cdc697f40b8af82d1d19f9ab60e',
  1,
  120,
  'CREDIT',
  120,
  'RUB'
WHERE NOT EXISTS (
  SELECT 1 FROM "tariff_versions"
  WHERE "model_config_id" = 'video-seedance-2'
    AND "parameter_hash" = '1e37e3b1fd93f5bf8658a06de77656d35e653cdc697f40b8af82d1d19f9ab60e'
);
