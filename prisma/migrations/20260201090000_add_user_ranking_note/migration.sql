-- Add optional note to user rankings
ALTER TABLE "UserRanking" ADD COLUMN IF NOT EXISTS "note" TEXT;
