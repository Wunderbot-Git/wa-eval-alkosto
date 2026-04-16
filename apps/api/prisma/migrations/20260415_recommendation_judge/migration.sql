-- AlterTable: Evaluation gets recommendation + extraction columns
ALTER TABLE "Evaluation"
  ADD COLUMN "recommendationFindings" JSONB,
  ADD COLUMN "recommendationSummary" TEXT,
  ADD COLUMN "extractedNeeds" JSONB;

-- AlterTable: Finding gains a `module` discriminator (default 'integrity' for existing rows)
ALTER TABLE "Finding"
  ADD COLUMN "module" TEXT NOT NULL DEFAULT 'integrity';

-- CreateIndex
CREATE INDEX "Finding_module_idx" ON "Finding"("module");
