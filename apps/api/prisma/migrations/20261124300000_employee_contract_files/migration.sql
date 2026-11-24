-- §3 → Contracts (owner, 2026-11-24): a contract's signed copy, one row per page (a phone photo is
-- one page each), in upload order. Never deleted: removing a page is soft (removed_at / removed_by,
-- with the reason), kept for the audit log. The file is found by its stored link (`url`, unique):
-- files follow their record.

-- CreateTable
CREATE TABLE "employee_contract_files" (
    "id" UUID NOT NULL,
    "contract_id" UUID NOT NULL,
    "url" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "mime_type" TEXT NOT NULL,
    "size_bytes" INTEGER NOT NULL,
    "page_order" INTEGER NOT NULL,
    "uploaded_by_id" UUID,
    "uploaded_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "removed_at" TIMESTAMP(3),
    "removed_by_id" UUID,
    "removed_reason" TEXT,

    CONSTRAINT "employee_contract_files_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "employee_contract_files_url_key" ON "employee_contract_files"("url");

-- CreateIndex
CREATE INDEX "employee_contract_files_uploaded_by_id_idx" ON "employee_contract_files"("uploaded_by_id");

-- CreateIndex
CREATE INDEX "employee_contract_files_removed_by_id_idx" ON "employee_contract_files"("removed_by_id");

-- CreateIndex
CREATE UNIQUE INDEX "employee_contract_files_contract_id_page_order_key" ON "employee_contract_files"("contract_id", "page_order");

-- AddForeignKey
ALTER TABLE "employee_contract_files" ADD CONSTRAINT "employee_contract_files_contract_id_fkey" FOREIGN KEY ("contract_id") REFERENCES "employee_contracts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "employee_contract_files" ADD CONSTRAINT "employee_contract_files_uploaded_by_id_fkey" FOREIGN KEY ("uploaded_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "employee_contract_files" ADD CONSTRAINT "employee_contract_files_removed_by_id_fkey" FOREIGN KEY ("removed_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
