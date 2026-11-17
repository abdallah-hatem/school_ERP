-- §3 (owner, 2026-11-18): job titles whose holders can be chosen as a direct manager.
ALTER TABLE "job_titles" ADD COLUMN "manages_people" BOOLEAN NOT NULL DEFAULT false;

-- CreateIndex
CREATE INDEX "job_titles_manages_people_idx" ON "job_titles"("manages_people");
