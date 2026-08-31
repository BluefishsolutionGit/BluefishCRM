-- Adds a priority tier to the "manager suggestion" coach line on an opportunity.
-- Null = the deal owner has no coaching yet; non-null values are checked at the
-- application layer against the enum {'info','watch','urgent'}.

ALTER TABLE "Opportunity" ADD COLUMN "managerHintPriority" TEXT;
