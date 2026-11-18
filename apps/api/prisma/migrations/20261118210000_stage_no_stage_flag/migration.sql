-- The "no stage" entry (§3) gets a flag instead of being recognised by its English name, so renaming
-- it (or a school calling it something else) keeps its role.
ALTER TABLE "stages" ADD COLUMN "is_no_stage" BOOLEAN NOT NULL DEFAULT false;

-- Existing data: mark the one stage the old code recognised — English name "None" (trimmed, any
-- case); if several match, the first in stage order. A fresh database has no stages yet: the seed
-- marks the one it creates.
UPDATE "stages"
SET "is_no_stage" = true
WHERE "id" = (
  SELECT "id" FROM "stages"
  WHERE lower(btrim("name_en")) = 'none'
  ORDER BY "sort_order", "created_at", "id"
  LIMIT 1
);
