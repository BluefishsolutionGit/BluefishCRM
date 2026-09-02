-- Track who set the manager hint so the owner can see "จากคุณ X" on
-- the mobile Home suggestions list. Optional; existing rows keep null
-- (their hint was written before we started tracking authorship).

ALTER TABLE "Opportunity" ADD COLUMN "managerHintById" TEXT;
