-- Links issued before the emergency flag existed had a one-hour lifetime.
UPDATE "invitations"
SET "is_emergency" = true
WHERE "is_emergency" = false
  AND "expires_at" <= "created_at" + INTERVAL '1 hour 1 minute';
