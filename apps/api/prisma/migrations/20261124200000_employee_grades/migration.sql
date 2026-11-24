-- §3 (owner, 2026-11-24): an employee's grade is picked from the school's Grades list (Settings),
-- like departments and job titles, instead of free text. Every distinct non-empty grade text
-- already on an employee (trimmed) becomes one grade — the same text in English and Arabic, in
-- alphabetical order — the employees point at it, and the text column goes.

-- CreateTable
CREATE TABLE "grades" (
    "id" UUID NOT NULL,
    "name_en" TEXT NOT NULL,
    "name_ar" TEXT NOT NULL,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "search_text" TEXT GENERATED ALWAYS AS (search_fold(coalesce("name_en", '') || ' ' || coalesce("name_ar", ''))) STORED,
    "search_compact" TEXT GENERATED ALWAYS AS (replace(search_fold(coalesce("name_en", '') || ' ' || coalesce("name_ar", '')), ' ', '')) STORED,

    CONSTRAINT "grades_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "grades_is_active_idx" ON "grades"("is_active");

-- CreateIndex
CREATE INDEX "grades_sort_order_idx" ON "grades"("sort_order");

-- CreateIndex
CREATE INDEX "grades_search_text_idx" ON "grades" USING GIN ("search_text" public.gin_trgm_ops);

-- CreateIndex
CREATE INDEX "grades_search_compact_idx" ON "grades" USING GIN ("search_compact" public.gin_trgm_ops);

-- AlterTable
ALTER TABLE "employees" ADD COLUMN "grade_id" UUID;

-- CreateIndex
CREATE INDEX "employees_grade_id_idx" ON "employees"("grade_id");

-- AddForeignKey
ALTER TABLE "employees" ADD CONSTRAINT "employees_grade_id_fkey" FOREIGN KEY ("grade_id") REFERENCES "grades"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- One grade per distinct trimmed text, numbered in alphabetical (byte) order.
INSERT INTO "grades" ("id", "name_en", "name_ar", "sort_order", "created_at", "updated_at")
SELECT gen_random_uuid(), g.name, g.name, (row_number() OVER (ORDER BY g.name COLLATE "C"))::int, now(), now()
FROM (
    SELECT DISTINCT btrim("grade") AS name
    FROM "employees"
    WHERE "grade" IS NOT NULL AND btrim("grade") <> ''
) AS g;

UPDATE "employees" AS e
SET "grade_id" = g."id"
FROM "grades" AS g
WHERE e."grade" IS NOT NULL AND btrim(e."grade") = g."name_en";

-- AlterTable
ALTER TABLE "employees" DROP COLUMN "grade";
