-- P4 (spec roles-permissions): HR's deprecated `employees.user_id` goes. The link lives in
-- `users.employee_id` since P2, which copied it; nothing has read or written `user_id` since.
-- Copy once more any link P2 could not have seen (a user still unlinked, an employee nobody holds),
-- so no link is lost, then drop the column.
UPDATE "users" u
SET "employee_id" = e."id"
FROM "employees" e
WHERE e."user_id" = u."id"
  AND u."employee_id" IS NULL
  AND NOT EXISTS (SELECT 1 FROM "users" o WHERE o."employee_id" = e."id");

-- DropForeignKey
ALTER TABLE "employees" DROP CONSTRAINT "employees_user_id_fkey";

-- DropIndex
DROP INDEX "employees_user_id_key";

-- AlterTable
ALTER TABLE "employees" DROP COLUMN "user_id";
