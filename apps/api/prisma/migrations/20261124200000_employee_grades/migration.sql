-- §3 (owner, 2026-11-24): an employee's grade is picked from the school's Employee grades list
-- (Settings), like departments and job titles, instead of free text. ("Grades" alone is reserved for
-- academics — school grades — so the table is employee_grades.)
--
-- Existing texts are grouped by a normalised key — trimmed, inner spaces collapsed, lower case — so
-- "Senior", " senior " and "SENIOR  " become one grade. Each grade is named after its most common
-- original spelling (trimmed; ties: the first alphabetically, byte order), the same text in English
-- and Arabic, numbered in that order; employees point at their key's grade, and the text column
-- goes. Blank grades stay empty.

-- CreateTable
CREATE TABLE "employee_grades" (
    "id" UUID NOT NULL,
    "name_en" TEXT NOT NULL,
    "name_ar" TEXT NOT NULL,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "search_text" TEXT GENERATED ALWAYS AS (search_fold(coalesce("name_en", '') || ' ' || coalesce("name_ar", ''))) STORED,
    "search_compact" TEXT GENERATED ALWAYS AS (replace(search_fold(coalesce("name_en", '') || ' ' || coalesce("name_ar", '')), ' ', '')) STORED,

    CONSTRAINT "employee_grades_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "employee_grades_is_active_idx" ON "employee_grades"("is_active");

-- CreateIndex
CREATE INDEX "employee_grades_sort_order_idx" ON "employee_grades"("sort_order");

-- CreateIndex
CREATE INDEX "employee_grades_search_text_idx" ON "employee_grades" USING GIN ("search_text" public.gin_trgm_ops);

-- CreateIndex
CREATE INDEX "employee_grades_search_compact_idx" ON "employee_grades" USING GIN ("search_compact" public.gin_trgm_ops);

-- AlterTable
ALTER TABLE "employees" ADD COLUMN "employee_grade_id" UUID;

-- CreateIndex
CREATE INDEX "employees_employee_grade_id_idx" ON "employees"("employee_grade_id");

-- AddForeignKey
ALTER TABLE "employees" ADD CONSTRAINT "employees_employee_grade_id_fkey" FOREIGN KEY ("employee_grade_id") REFERENCES "employee_grades"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- One grade per normalised key, named after its most common spelling.
CREATE TEMP TABLE "grade_migration" AS
SELECT key, name, gen_random_uuid() AS id
FROM (
    SELECT key, spelling AS name,
           row_number() OVER (PARTITION BY key ORDER BY count(*) DESC, spelling COLLATE "C") AS rank
    FROM (
        SELECT lower(regexp_replace(btrim("grade"), '\s+', ' ', 'g')) AS key, btrim("grade") AS spelling
        FROM "employees"
        WHERE "grade" IS NOT NULL AND btrim("grade") <> ''
    ) AS texts
    GROUP BY key, spelling
) AS ranked
WHERE rank = 1;

INSERT INTO "employee_grades" ("id", "name_en", "name_ar", "sort_order", "created_at", "updated_at")
SELECT id, name, name, (row_number() OVER (ORDER BY name COLLATE "C"))::int, now(), now()
FROM "grade_migration";

UPDATE "employees" AS e
SET "employee_grade_id" = m.id
FROM "grade_migration" AS m
WHERE e."grade" IS NOT NULL AND lower(regexp_replace(btrim(e."grade"), '\s+', ' ', 'g')) = m.key;

-- AlterTable
ALTER TABLE "employees" DROP COLUMN "grade";

DROP TABLE "grade_migration";
