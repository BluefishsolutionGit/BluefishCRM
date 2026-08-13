-- Rename Opportunity.aiHint to Opportunity.managerHint (preserves existing values)
ALTER TABLE "Opportunity" RENAME COLUMN "aiHint" TO "managerHint";
