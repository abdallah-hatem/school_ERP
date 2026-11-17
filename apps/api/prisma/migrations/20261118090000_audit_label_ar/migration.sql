-- The audit log keeps a record's name in both languages (UI audit, finding 3): `entity_label` stays
-- the English (or only) name, `entity_label_ar` holds the Arabic one. Existing rows keep NULL and
-- read as the same name in both languages — the table is append-only (D8), so nothing is backfilled.
ALTER TABLE "audit_entries" ADD COLUMN "entity_label_ar" TEXT;
