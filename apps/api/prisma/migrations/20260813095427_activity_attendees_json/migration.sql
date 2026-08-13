-- Rich attendee objects supersede the flat email string[]. Dev data is discarded here;
-- production would need a two-step migration (copy → cutover) instead.
ALTER TABLE "Activity" DROP COLUMN "attendees";
ALTER TABLE "Activity" ADD COLUMN "attendees" JSONB NOT NULL DEFAULT '[]'::jsonb;
