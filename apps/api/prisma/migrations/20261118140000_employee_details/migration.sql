-- CreateEnum
CREATE TYPE "InsuranceStatus" AS ENUM ('INSURED', 'NOT_INSURED');

-- CreateEnum
CREATE TYPE "Degree" AS ENUM ('NONE', 'SECONDARY', 'DIPLOMA', 'BACHELOR', 'MASTER', 'DOCTORATE');

-- AlterTable
ALTER TABLE "employees" ADD COLUMN     "bank_account_number" TEXT,
ADD COLUMN     "bank_name" TEXT,
ADD COLUMN     "emergency_contact_name" TEXT,
ADD COLUMN     "emergency_contact_phone" TEXT,
ADD COLUMN     "emergency_contact_relationship" TEXT,
ADD COLUMN     "graduation_year" INTEGER,
ADD COLUMN     "highest_degree" "Degree",
ADD COLUMN     "iban" TEXT,
ADD COLUMN     "insurance_number" TEXT,
ADD COLUMN     "insurance_registration_date" DATE,
ADD COLUMN     "insurance_status" "InsuranceStatus" NOT NULL DEFAULT 'NOT_INSURED',
ADD COLUMN     "insured_salary" INTEGER,
ADD COLUMN     "major" TEXT,
ADD COLUMN     "photo_url" TEXT,
ADD COLUMN     "university" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "employees_insurance_number_key" ON "employees"("insurance_number");

-- §3: a not-insured employee keeps no insurance number, registration date or insured salary.
ALTER TABLE "employees" ADD CONSTRAINT "employees_not_insured_has_no_insurance_details" CHECK (
  "insurance_status" = 'INSURED'
  OR ("insurance_number" IS NULL AND "insurance_registration_date" IS NULL AND "insured_salary" IS NULL)
);

