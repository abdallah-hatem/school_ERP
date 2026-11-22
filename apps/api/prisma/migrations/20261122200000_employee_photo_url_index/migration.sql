-- A stored employee photo opens for whoever may see its employee: the file request finds the
-- employee by the photo's URL (docs/ARCHITECTURE.md → Security → Files follow their record).
CREATE INDEX "employees_photo_url_idx" ON "employees"("photo_url");
