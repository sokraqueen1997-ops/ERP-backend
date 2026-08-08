/*
  Warnings:

  - A unique constraint covering the columns `[zatcaUuid]` on the table `sales` will be added. If there are existing duplicate values, this will fail.
  - The required column `zatcaUuid` was added to the `sales` table with a prisma-level default value. This is not possible if the table is not empty. Please add this column as optional, then populate it before making it required.

*/
-- AlterTable
ALTER TABLE "customers" ADD COLUMN     "vatNumber" TEXT;

-- AlterTable: add zatcaUuid as OPTIONAL first (existing rows need a value before we can require it)
ALTER TABLE "sales" ADD COLUMN     "sellerName" TEXT,
ADD COLUMN     "sellerVatNumber" TEXT,
ADD COLUMN     "zatcaUuid" TEXT;

-- Backfill a unique UUID for every existing sale
UPDATE "sales" SET "zatcaUuid" = gen_random_uuid()::text WHERE "zatcaUuid" IS NULL;

-- Now that every row has a value, enforce NOT NULL
ALTER TABLE "sales" ALTER COLUMN "zatcaUuid" SET NOT NULL;

-- CreateTable
CREATE TABLE "company_settings" (
    "id" TEXT NOT NULL DEFAULT 'singleton',
    "legalNameAr" TEXT NOT NULL,
    "legalNameEn" TEXT,
    "vatNumber" TEXT NOT NULL,
    "crNumber" TEXT,
    "buildingNumber" TEXT,
    "streetName" TEXT,
    "district" TEXT,
    "city" TEXT,
    "postalCode" TEXT,
    "additionalNumber" TEXT,
    "countryCode" TEXT NOT NULL DEFAULT 'SA',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "company_settings_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "sales_zatcaUuid_key" ON "sales"("zatcaUuid");
