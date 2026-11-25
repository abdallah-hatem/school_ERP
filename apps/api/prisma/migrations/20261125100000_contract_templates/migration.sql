-- Contract templates and printed copies (spec docs/specs/2026-11-24-contract-templates.md).
-- None of the existing tables change. Templates are never deleted (only hidden); versions and copies
-- are insert-only (no update path in the code). The signed scan (contracts round 3) links to a copy
-- with its own `signed_copy_id` → contract_copies.id.

-- CreateEnum
CREATE TYPE "ContractLanguage" AS ENUM ('AR', 'EN');

-- CreateEnum
CREATE TYPE "ContractCopyOutput" AS ENUM ('PRINT', 'PDF');

-- CreateTable
CREATE TABLE "contract_templates" (
    "id" UUID NOT NULL,
    "name_en" TEXT NOT NULL,
    "name_ar" TEXT NOT NULL,
    "default_for_work_system" "WorkSystem",
    "hidden_at" TIMESTAMP(3),
    "current_version" INTEGER NOT NULL DEFAULT 1,
    "created_by_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_by_id" UUID,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "search_text" TEXT GENERATED ALWAYS AS (search_fold(coalesce("name_en", '') || ' ' || coalesce("name_ar", ''))) STORED,
    "search_compact" TEXT GENERATED ALWAYS AS (replace(search_fold(coalesce("name_en", '') || ' ' || coalesce("name_ar", '')), ' ', '')) STORED,

    CONSTRAINT "contract_templates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "contract_template_versions" (
    "id" UUID NOT NULL,
    "template_id" UUID NOT NULL,
    "version" INTEGER NOT NULL,
    "body_ar" JSONB NOT NULL,
    "body_en" JSONB,
    "has_english" BOOLEAN NOT NULL,
    "uses_salary" BOOLEAN NOT NULL,
    "fields" TEXT[],
    "created_by_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "contract_template_versions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "contract_copies" (
    "id" UUID NOT NULL,
    "contract_id" UUID NOT NULL,
    "employee_id" UUID NOT NULL,
    "template_id" UUID NOT NULL,
    "template_version_id" UUID NOT NULL,
    "template_name_en" TEXT NOT NULL,
    "template_name_ar" TEXT NOT NULL,
    "language" "ContractLanguage" NOT NULL,
    "document" JSONB NOT NULL,
    "values" JSONB NOT NULL,
    "text_edited" BOOLEAN NOT NULL,
    "contains_salary" BOOLEAN NOT NULL,
    "output" "ContractCopyOutput" NOT NULL,
    "file_url" TEXT NOT NULL,
    "page_count" INTEGER NOT NULL,
    "printed_by_id" UUID,
    "printed_by_name" TEXT NOT NULL,
    "printed_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "contract_copies_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "contract_templates_created_by_id_idx" ON "contract_templates"("created_by_id");

-- CreateIndex
CREATE INDEX "contract_templates_updated_by_id_idx" ON "contract_templates"("updated_by_id");

-- CreateIndex
CREATE INDEX "contract_templates_search_text_idx" ON "contract_templates" USING GIN ("search_text" public.gin_trgm_ops);

-- CreateIndex
CREATE INDEX "contract_templates_search_compact_idx" ON "contract_templates" USING GIN ("search_compact" public.gin_trgm_ops);

-- CreateIndex
CREATE INDEX "contract_template_versions_created_by_id_idx" ON "contract_template_versions"("created_by_id");

-- CreateIndex
CREATE UNIQUE INDEX "contract_template_versions_template_id_version_key" ON "contract_template_versions"("template_id", "version");

-- CreateIndex
CREATE UNIQUE INDEX "contract_copies_file_url_key" ON "contract_copies"("file_url");

-- CreateIndex
CREATE INDEX "contract_copies_contract_id_idx" ON "contract_copies"("contract_id");

-- CreateIndex
CREATE INDEX "contract_copies_employee_id_idx" ON "contract_copies"("employee_id");

-- CreateIndex
CREATE INDEX "contract_copies_template_id_idx" ON "contract_copies"("template_id");

-- CreateIndex
CREATE INDEX "contract_copies_template_version_id_idx" ON "contract_copies"("template_version_id");

-- CreateIndex
CREATE INDEX "contract_copies_printed_by_id_idx" ON "contract_copies"("printed_by_id");

-- AddForeignKey
ALTER TABLE "contract_templates" ADD CONSTRAINT "contract_templates_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contract_templates" ADD CONSTRAINT "contract_templates_updated_by_id_fkey" FOREIGN KEY ("updated_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contract_template_versions" ADD CONSTRAINT "contract_template_versions_template_id_fkey" FOREIGN KEY ("template_id") REFERENCES "contract_templates"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contract_template_versions" ADD CONSTRAINT "contract_template_versions_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contract_copies" ADD CONSTRAINT "contract_copies_contract_id_fkey" FOREIGN KEY ("contract_id") REFERENCES "employee_contracts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contract_copies" ADD CONSTRAINT "contract_copies_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "employees"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contract_copies" ADD CONSTRAINT "contract_copies_template_id_fkey" FOREIGN KEY ("template_id") REFERENCES "contract_templates"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contract_copies" ADD CONSTRAINT "contract_copies_template_version_id_fkey" FOREIGN KEY ("template_version_id") REFERENCES "contract_template_versions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contract_copies" ADD CONSTRAINT "contract_copies_printed_by_id_fkey" FOREIGN KEY ("printed_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Names unique in each language, case-insensitive (spec → Data).
CREATE UNIQUE INDEX "contract_templates_name_en_lower_key" ON "contract_templates"(lower("name_en"));
CREATE UNIQUE INDEX "contract_templates_name_ar_lower_key" ON "contract_templates"(lower("name_ar"));

-- At most one shown default per work system (edge case 11): of two saves at once, one wins.
CREATE UNIQUE INDEX "contract_templates_one_default_per_work_system" ON "contract_templates"("default_for_work_system")
  WHERE "default_for_work_system" IS NOT NULL AND "hidden_at" IS NULL;

-- The permission on the starting roles (BUILT_IN_ROLES, GUESS): the HR manager and the System
-- admin's stored list. Joined on the role's key, so a deleted starting role is skipped; idempotent.
INSERT INTO "role_permissions" ("role_id", "permission_key", "scope")
SELECT r."id", g.permission_key, g.scope::"PermissionScope"
FROM (VALUES
    ('system_admin', 'hr.contract_templates.manage', 'all'),
    ('hr_manager', 'hr.contract_templates.manage', 'all')
) AS g(role_key, permission_key, scope)
JOIN "roles" r ON r."key" = g.role_key
ON CONFLICT ("role_id", "permission_key") DO NOTHING;
