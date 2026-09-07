-- Customer Voice log — feedback captured against a customer.
-- See requirements/add_customervoice.md for scope.

CREATE TABLE "CustomerVoice" (
  "id"            TEXT NOT NULL,
  "customerId"    TEXT NOT NULL,
  "authorId"      TEXT NOT NULL,
  "kind"          TEXT NOT NULL,
  "rating"        INTEGER,
  "text"          TEXT NOT NULL,
  "source"        TEXT,
  "topic"         TEXT,
  "activityId"    TEXT,
  "opportunityId" TEXT,
  "createdAt"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"     TIMESTAMP(3) NOT NULL,
  CONSTRAINT "CustomerVoice_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "CustomerVoice_customerId_idx" ON "CustomerVoice"("customerId");
CREATE INDEX "CustomerVoice_kind_idx"       ON "CustomerVoice"("kind");
CREATE INDEX "CustomerVoice_createdAt_idx"  ON "CustomerVoice"("createdAt");

ALTER TABLE "CustomerVoice"
  ADD CONSTRAINT "CustomerVoice_customerId_fkey"
  FOREIGN KEY ("customerId") REFERENCES "Customer"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "CustomerVoice"
  ADD CONSTRAINT "CustomerVoice_authorId_fkey"
  FOREIGN KEY ("authorId") REFERENCES "User"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "CustomerVoice"
  ADD CONSTRAINT "CustomerVoice_activityId_fkey"
  FOREIGN KEY ("activityId") REFERENCES "Activity"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "CustomerVoice"
  ADD CONSTRAINT "CustomerVoice_opportunityId_fkey"
  FOREIGN KEY ("opportunityId") REFERENCES "Opportunity"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
