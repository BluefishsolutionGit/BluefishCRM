-- AlterTable
ALTER TABLE "Document" ADD COLUMN "kind" TEXT NOT NULL DEFAULT 'file';
ALTER TABLE "Document" ADD COLUMN "url"  TEXT;
