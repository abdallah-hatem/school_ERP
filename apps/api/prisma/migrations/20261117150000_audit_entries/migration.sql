-- T27 — the audit log (§9, docs/specs/2026-11-17-audit-log.md).
--   1. audit_entries + indexes
--   2. settings history moves in (D9): every setting_changes row is copied, one entry each,
--      keeping its id, actor, time and old / new value; the copy is checked row by row
--   3. setting_changes is dropped only after that check passes (otherwise the migration fails
--      and nothing is applied)
--   4. append-only (D8): a trigger refuses UPDATE, DELETE and TRUNCATE

-- 1 ── table ────────────────────────────────────────────────────────────────────────────────
CREATE TABLE "audit_entries" (
    "id" UUID NOT NULL,
    "seq" BIGSERIAL NOT NULL,
    "action" TEXT NOT NULL,
    "module" TEXT NOT NULL,
    "entity_type" TEXT NOT NULL,
    "entity_id" TEXT NOT NULL,
    "entity_label" TEXT NOT NULL,
    "actor_id" UUID,
    "actor_name" TEXT,
    "changes" JSONB NOT NULL DEFAULT '[]',
    "meta" JSONB NOT NULL DEFAULT '{}',
    "at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_entries_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "audit_entries_at_idx" ON "audit_entries"("at" DESC);
CREATE INDEX "audit_entries_entity_type_entity_id_at_idx" ON "audit_entries"("entity_type", "entity_id", "at");
CREATE INDEX "audit_entries_actor_id_at_idx" ON "audit_entries"("actor_id", "at");
CREATE INDEX "audit_entries_module_at_idx" ON "audit_entries"("module", "at");
CREATE INDEX "audit_entries_action_at_idx" ON "audit_entries"("action", "at");

-- 2 ── copy the settings history ───────────────────────────────────────────────────────────
-- key → action / record. The change keeps the key as its field and the whole old / new value,
-- so Settings → Change history reads exactly as before (edge case 11). An unknown key leaves
-- the action NULL and the insert fails: history is never silently dropped.
INSERT INTO "audit_entries"
    ("id", "action", "module", "entity_type", "entity_id", "entity_label",
     "actor_id", "actor_name", "changes", "meta", "at")
SELECT
    sc."id",
    m."action",
    split_part(m."action", '.', 1),
    m."entity_type",
    m."entity_id",
    m."entity_label",
    sc."changed_by_id",
    u."name",
    jsonb_build_array(jsonb_build_object(
        'field', sc."key",
        'before', COALESCE(sc."old_value", 'null'::jsonb),
        'after', COALESCE(sc."new_value", 'null'::jsonb))),
    jsonb_build_object('ip', NULL, 'userAgent', NULL, 'requestId', NULL, 'source', 'setting_changes'),
    sc."changed_at"
FROM "setting_changes" sc
LEFT JOIN "users" u ON u."id" = sc."changed_by_id"
CROSS JOIN LATERAL (
    SELECT
        COALESCE(sc."old_value", 'null'::jsonb) = 'null'::jsonb AS created,
        COALESCE(NULLIF(sc."new_value", 'null'::jsonb), sc."old_value") AS snapshot
) v
CROSS JOIN LATERAL (
    SELECT
        CASE
            WHEN sc."scope" = 'SCHOOL' AND sc."key" = 'school.logoUrl' THEN 'core.settings.logo_change'
            WHEN sc."scope" = 'SCHOOL' THEN 'core.settings.update'
            WHEN sc."scope" = 'HR' THEN 'hr.settings.update'
            WHEN sc."scope" = 'LISTS' AND sc."key" LIKE 'lists.stages.%'
                THEN CASE WHEN v.created THEN 'core.stage.create' ELSE 'core.stage.update' END
            WHEN sc."scope" = 'LISTS' AND sc."key" = 'hr.departments'
                THEN CASE WHEN v.created THEN 'hr.department.create' ELSE 'hr.department.update' END
            WHEN sc."scope" = 'LISTS' AND sc."key" = 'hr.jobTitles'
                THEN CASE WHEN v.created THEN 'hr.job_title.create' ELSE 'hr.job_title.update' END
            WHEN sc."scope" = 'CATALOGUE' AND sc."key" = 'hr.penaltyGroups'
                THEN CASE WHEN v.created THEN 'hr.penalty_group.create' ELSE 'hr.penalty_group.update' END
            WHEN sc."scope" = 'CATALOGUE' AND sc."key" = 'hr.violations'
                THEN CASE WHEN v.created THEN 'hr.violation.create' ELSE 'hr.violation.update' END
        END AS "action",
        CASE
            WHEN sc."scope" = 'SCHOOL' THEN 'school_settings'
            WHEN sc."scope" = 'HR' THEN 'hr_settings'
            WHEN sc."key" LIKE 'lists.stages.%' THEN 'stage'
            WHEN sc."key" = 'hr.departments' THEN 'department'
            WHEN sc."key" = 'hr.jobTitles' THEN 'job_title'
            WHEN sc."key" = 'hr.penaltyGroups' THEN 'penalty_group'
            WHEN sc."key" = 'hr.violations' THEN 'violation'
        END AS "entity_type",
        CASE
            WHEN sc."scope" = 'SCHOOL' THEN 'school'
            WHEN sc."scope" = 'HR' THEN 'hr'
            WHEN sc."key" LIKE 'lists.stages.%' THEN substr(sc."key", length('lists.stages.') + 1)
            ELSE COALESCE(v.snapshot ->> 'id', '')
        END AS "entity_id",
        CASE
            WHEN sc."scope" IN ('SCHOOL', 'HR') THEN ''
            ELSE COALESCE(v.snapshot ->> 'nameEn', v.snapshot ->> 'nameAr', '')
        END AS "entity_label"
) m
ORDER BY sc."changed_at", sc."id";

-- Every row copied exactly: same id, time, person, key and values. Stops the migration otherwise.
DO $$
DECLARE
    missing integer;
BEGIN
    SELECT count(*) INTO missing
    FROM "setting_changes" sc
    WHERE NOT EXISTS (
        SELECT 1 FROM "audit_entries" a
        WHERE a."id" = sc."id"
          AND a."at" = sc."changed_at"
          AND a."actor_id" IS NOT DISTINCT FROM sc."changed_by_id"
          AND jsonb_array_length(a."changes") = 1
          AND a."changes" -> 0 ->> 'field' = sc."key"
          AND a."changes" -> 0 -> 'before' = COALESCE(sc."old_value", 'null'::jsonb)
          AND a."changes" -> 0 -> 'after' = COALESCE(sc."new_value", 'null'::jsonb)
    );
    IF missing > 0 THEN
        RAISE EXCEPTION 'audit_entries: % setting_changes row(s) were not copied exactly', missing;
    END IF;
END $$;

-- 3 ── drop the old history ────────────────────────────────────────────────────────────────
ALTER TABLE "setting_changes" DROP CONSTRAINT "setting_changes_changed_by_id_fkey";
DROP TABLE "setting_changes";
DROP TYPE "SettingScope";

-- 4 ── append-only (D8) ────────────────────────────────────────────────────────────────────
CREATE FUNCTION "audit_entries_append_only"() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
    RAISE EXCEPTION 'audit_entries is append-only: % is not allowed', TG_OP
        USING ERRCODE = 'insufficient_privilege';
END;
$$;

CREATE TRIGGER "audit_entries_no_update_delete"
    BEFORE UPDATE OR DELETE ON "audit_entries"
    FOR EACH ROW EXECUTE FUNCTION "audit_entries_append_only"();

CREATE TRIGGER "audit_entries_no_truncate"
    BEFORE TRUNCATE ON "audit_entries"
    FOR EACH STATEMENT EXECUTE FUNCTION "audit_entries_append_only"();
