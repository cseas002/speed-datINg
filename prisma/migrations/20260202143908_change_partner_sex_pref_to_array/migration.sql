/*
  Warnings:

  - The `partnerSexPref` column on the `Participant` table would be dropped and recreated. This will lead to data loss if there is data in the column.

*/
-- AlterTable
ALTER TABLE "Participant" DROP COLUMN "partnerSexPref",
ADD COLUMN     "partnerSexPref" TEXT[];
