-- Link a deal to the customer contact to reach out to. Optional; existing deals keep
-- null. Deleting the contact clears the link rather than the deal.

ALTER TABLE "Opportunity" ADD COLUMN "contactId" TEXT;

CREATE INDEX "Opportunity_contactId_idx" ON "Opportunity"("contactId");

ALTER TABLE "Opportunity" ADD CONSTRAINT "Opportunity_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "Contact"("id") ON DELETE SET NULL ON UPDATE CASCADE;
