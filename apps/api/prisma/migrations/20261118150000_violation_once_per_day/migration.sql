-- §4 (owner, 2026-11-18): a violation counts at most once per employee per date unless it is one
-- that genuinely repeats within a day. On for every existing violation; the seed turns it off for
-- the repeating ones. Approved penalties are not touched.
ALTER TABLE "violations" ADD COLUMN "once_per_day" BOOLEAN NOT NULL DEFAULT true;
