-- Arabic-aware, indexed database search (owner, 2026-11-22). The database keeps every searched
-- table's search text up to date itself: a fold function, two generated columns per table and a
-- trigram index on each. The app never writes these columns (docs/ARCHITECTURE.md -> Search).

-- In public, and its operator class named with the schema, so a replay of this file in another
-- schema (the migration e2e specs set search_path to a throwaway one) still finds it.
CREATE EXTENSION IF NOT EXISTS pg_trgm WITH SCHEMA public;

-- search_fold(text): exactly what searchKey() in packages/shared/src/search.ts does — the API e2e
-- spec search-fold.e2e-spec.ts checks the two give the same result on a shared fixture.
--   1. NFD, then drop Latin combining accents (U+0300-U+036F: Moná -> mona, every accented Latin
--      letter that decomposes — no unaccent extension; letters with no decomposition such as
--      ø, æ, ł, đ, ß, ı stay as they are, on both sides), Arabic marks (U+064B-U+0670: tanween,
--      short vowels, shadda, sukun, U+065F, the dagger alef), the tatweel (U+0640) and zero-width characters (U+200B-U+200F,
--      U+FEFF). NFD also splits hamza/madda off alef, waw and yeh (أ إ آ ؤ ئ).
--   2. Fold the Arabic letter variants: أ إ آ ٱ -> ا, ى -> ي, ة -> ه, ؤ -> و, ئ -> ي.
--   3. lower(); every whitespace-like character (tab, newline, NBSP, the U+2000 spaces, ...) becomes
--      one space, runs collapse, ends are trimmed.
-- IMMUTABLE so generated columns and indexes can use it (normalize, translate, regexp_replace and
-- lower on text are all immutable).
CREATE OR REPLACE FUNCTION search_fold(input text) RETURNS text
LANGUAGE sql IMMUTABLE STRICT PARALLEL SAFE
AS $$
  SELECT btrim(regexp_replace(
    lower(translate(
      regexp_replace(normalize(input, NFD), '[\u0300-\u036F\u064B-\u0670\u0640\u200B-\u200F\uFEFF]', '', 'g'),
      'أإآٱىةؤئ', 'اااايهوي')),
    '[\u0009-\u000D\u0020\u00A0\u1680\u2000-\u200A\u2028\u2029\u202F\u205F\u3000]+', ' ', 'g'), ' ')
$$;

-- 1. employees: code, English and Arabic names.
ALTER TABLE "employees"
  ADD COLUMN "search_text" TEXT GENERATED ALWAYS AS (search_fold(coalesce("code", '') || ' ' || coalesce("name_en", '') || ' ' || coalesce("name_ar", ''))) STORED,
  ADD COLUMN "search_compact" TEXT GENERATED ALWAYS AS (replace(search_fold(coalesce("code", '') || ' ' || coalesce("name_en", '') || ' ' || coalesce("name_ar", '')), ' ', '')) STORED;
CREATE INDEX "employees_search_text_idx" ON "employees" USING GIN ("search_text" public.gin_trgm_ops);
CREATE INDEX "employees_search_compact_idx" ON "employees" USING GIN ("search_compact" public.gin_trgm_ops);

-- 2. users: name and email.
ALTER TABLE "users"
  ADD COLUMN "search_text" TEXT GENERATED ALWAYS AS (search_fold(coalesce("name", '') || ' ' || coalesce("email", ''))) STORED,
  ADD COLUMN "search_compact" TEXT GENERATED ALWAYS AS (replace(search_fold(coalesce("name", '') || ' ' || coalesce("email", '')), ' ', '')) STORED;
CREATE INDEX "users_search_text_idx" ON "users" USING GIN ("search_text" public.gin_trgm_ops);
CREATE INDEX "users_search_compact_idx" ON "users" USING GIN ("search_compact" public.gin_trgm_ops);

-- 3. roles: both names.
ALTER TABLE "roles"
  ADD COLUMN "search_text" TEXT GENERATED ALWAYS AS (search_fold(coalesce("name_en", '') || ' ' || coalesce("name_ar", ''))) STORED,
  ADD COLUMN "search_compact" TEXT GENERATED ALWAYS AS (replace(search_fold(coalesce("name_en", '') || ' ' || coalesce("name_ar", '')), ' ', '')) STORED;
CREATE INDEX "roles_search_text_idx" ON "roles" USING GIN ("search_text" public.gin_trgm_ops);
CREATE INDEX "roles_search_compact_idx" ON "roles" USING GIN ("search_compact" public.gin_trgm_ops);

-- 4. stages: both names.
ALTER TABLE "stages"
  ADD COLUMN "search_text" TEXT GENERATED ALWAYS AS (search_fold(coalesce("name_en", '') || ' ' || coalesce("name_ar", ''))) STORED,
  ADD COLUMN "search_compact" TEXT GENERATED ALWAYS AS (replace(search_fold(coalesce("name_en", '') || ' ' || coalesce("name_ar", '')), ' ', '')) STORED;
CREATE INDEX "stages_search_text_idx" ON "stages" USING GIN ("search_text" public.gin_trgm_ops);
CREATE INDEX "stages_search_compact_idx" ON "stages" USING GIN ("search_compact" public.gin_trgm_ops);

-- 5. departments: both names.
ALTER TABLE "departments"
  ADD COLUMN "search_text" TEXT GENERATED ALWAYS AS (search_fold(coalesce("name_en", '') || ' ' || coalesce("name_ar", ''))) STORED,
  ADD COLUMN "search_compact" TEXT GENERATED ALWAYS AS (replace(search_fold(coalesce("name_en", '') || ' ' || coalesce("name_ar", '')), ' ', '')) STORED;
CREATE INDEX "departments_search_text_idx" ON "departments" USING GIN ("search_text" public.gin_trgm_ops);
CREATE INDEX "departments_search_compact_idx" ON "departments" USING GIN ("search_compact" public.gin_trgm_ops);

-- 6. job_titles: both names.
ALTER TABLE "job_titles"
  ADD COLUMN "search_text" TEXT GENERATED ALWAYS AS (search_fold(coalesce("name_en", '') || ' ' || coalesce("name_ar", ''))) STORED,
  ADD COLUMN "search_compact" TEXT GENERATED ALWAYS AS (replace(search_fold(coalesce("name_en", '') || ' ' || coalesce("name_ar", '')), ' ', '')) STORED;
CREATE INDEX "job_titles_search_text_idx" ON "job_titles" USING GIN ("search_text" public.gin_trgm_ops);
CREATE INDEX "job_titles_search_compact_idx" ON "job_titles" USING GIN ("search_compact" public.gin_trgm_ops);

-- 7. violations: both names.
ALTER TABLE "violations"
  ADD COLUMN "search_text" TEXT GENERATED ALWAYS AS (search_fold(coalesce("name_en", '') || ' ' || coalesce("name_ar", ''))) STORED,
  ADD COLUMN "search_compact" TEXT GENERATED ALWAYS AS (replace(search_fold(coalesce("name_en", '') || ' ' || coalesce("name_ar", '')), ' ', '')) STORED;
CREATE INDEX "violations_search_text_idx" ON "violations" USING GIN ("search_text" public.gin_trgm_ops);
CREATE INDEX "violations_search_compact_idx" ON "violations" USING GIN ("search_compact" public.gin_trgm_ops);

-- 8. audit_entries: the record's name in both languages.
ALTER TABLE "audit_entries"
  ADD COLUMN "search_text" TEXT GENERATED ALWAYS AS (search_fold(coalesce("entity_label", '') || ' ' || coalesce("entity_label_ar", ''))) STORED,
  ADD COLUMN "search_compact" TEXT GENERATED ALWAYS AS (replace(search_fold(coalesce("entity_label", '') || ' ' || coalesce("entity_label_ar", '')), ' ', '')) STORED;
CREATE INDEX "audit_entries_search_text_idx" ON "audit_entries" USING GIN ("search_text" public.gin_trgm_ops);
CREATE INDEX "audit_entries_search_compact_idx" ON "audit_entries" USING GIN ("search_compact" public.gin_trgm_ops);

-- 9. payroll_lines: code, both names, national id.
ALTER TABLE "payroll_lines"
  ADD COLUMN "search_text" TEXT GENERATED ALWAYS AS (search_fold(coalesce("employee_code", '') || ' ' || coalesce("name_en", '') || ' ' || coalesce("name_ar", '') || ' ' || coalesce("national_id", ''))) STORED,
  ADD COLUMN "search_compact" TEXT GENERATED ALWAYS AS (replace(search_fold(coalesce("employee_code", '') || ' ' || coalesce("name_en", '') || ' ' || coalesce("name_ar", '') || ' ' || coalesce("national_id", '')), ' ', '')) STORED;
CREATE INDEX "payroll_lines_search_text_idx" ON "payroll_lines" USING GIN ("search_text" public.gin_trgm_ops);
CREATE INDEX "payroll_lines_search_compact_idx" ON "payroll_lines" USING GIN ("search_compact" public.gin_trgm_ops);

-- 10. accounting_payroll_lines: code and both names.
ALTER TABLE "accounting_payroll_lines"
  ADD COLUMN "search_text" TEXT GENERATED ALWAYS AS (search_fold(coalesce("employee_code", '') || ' ' || coalesce("name_en", '') || ' ' || coalesce("name_ar", ''))) STORED,
  ADD COLUMN "search_compact" TEXT GENERATED ALWAYS AS (replace(search_fold(coalesce("employee_code", '') || ' ' || coalesce("name_en", '') || ' ' || coalesce("name_ar", '')), ' ', '')) STORED;
CREATE INDEX "accounting_payroll_lines_search_text_idx" ON "accounting_payroll_lines" USING GIN ("search_text" public.gin_trgm_ops);
CREATE INDEX "accounting_payroll_lines_search_compact_idx" ON "accounting_payroll_lines" USING GIN ("search_compact" public.gin_trgm_ops);

