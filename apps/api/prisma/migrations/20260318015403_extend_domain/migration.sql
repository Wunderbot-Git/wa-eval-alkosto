-- CreateEnum
CREATE TYPE "ConversationStatus" AS ENUM ('PENDING', 'EVALUATING', 'EVALUATED', 'NOT_EVALUABLE', 'FAILED');

-- CreateEnum
CREATE TYPE "MessageRole" AS ENUM ('CUSTOMER', 'AGENT');

-- CreateEnum
CREATE TYPE "EvaluationModule" AS ENUM ('INTEGRITY', 'QUALITY', 'PATTERNS', 'CONSOLIDATOR');

-- CreateEnum
CREATE TYPE "EvaluationLabel" AS ENUM ('APROBADA', 'CON_HALLAZGOS', 'FALLIDA');

-- CreateEnum
CREATE TYPE "FindingSeverity" AS ENUM ('WARNING', 'CRITICAL');

-- CreateEnum
CREATE TYPE "ShareType" AS ENUM ('RUN', 'CONVERSATION');

-- CreateEnum
CREATE TYPE "ExportStatus" AS ENUM ('PENDING', 'PROCESSING', 'COMPLETED', 'FAILED');

-- AlterTable
ALTER TABLE "Run" ADD COLUMN     "aggregateScore" DOUBLE PRECISION,
ADD COLUMN     "evaluatedCount" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "expiresAt" TIMESTAMP(3),
ADD COLUMN     "failedCount" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "notEvaluableCount" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "totalConversations" INTEGER NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "Catalog" (
    "id" TEXT NOT NULL,
    "filename" TEXT NOT NULL,
    "catalogDate" DATE NOT NULL,
    "productCount" INTEGER NOT NULL,
    "uploadedBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Catalog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CatalogProduct" (
    "id" TEXT NOT NULL,
    "catalogId" TEXT NOT NULL,
    "externalId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "listPrice" DOUBLE PRECISION,
    "salePrice" DOUBLE PRECISION,
    "paymentMethodPrice" TEXT,
    "availability" INTEGER,
    "category" TEXT,
    "brand" TEXT,
    "rawData" JSONB NOT NULL,

    CONSTRAINT "CatalogProduct_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Conversation" (
    "id" TEXT NOT NULL,
    "runId" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "conversationDate" TIMESTAMP(3) NOT NULL,
    "messageCount" INTEGER NOT NULL,
    "status" "ConversationStatus" NOT NULL DEFAULT 'PENDING',
    "notEvaluableReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Conversation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Message" (
    "id" TEXT NOT NULL,
    "conversationId" TEXT NOT NULL,
    "role" "MessageRole" NOT NULL,
    "content" TEXT NOT NULL,
    "orderIndex" INTEGER NOT NULL,

    CONSTRAINT "Message_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Evaluation" (
    "id" TEXT NOT NULL,
    "conversationId" TEXT NOT NULL,
    "module" "EvaluationModule" NOT NULL,
    "score" DOUBLE PRECISION,
    "label" "EvaluationLabel",
    "integrityFindings" JSONB,
    "qualitySubScores" JSONB,
    "patternClassifications" JSONB,
    "consolidatorExplanation" TEXT,
    "promptVersions" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Evaluation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Finding" (
    "id" TEXT NOT NULL,
    "evaluationId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "severity" "FindingSeverity" NOT NULL,
    "description" TEXT NOT NULL,
    "evidence" TEXT,

    CONSTRAINT "Finding_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Pattern" (
    "id" TEXT NOT NULL,
    "evaluationId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "isEmergent" BOOLEAN NOT NULL,
    "explanation" TEXT,
    "evidence" TEXT,

    CONSTRAINT "Pattern_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Snapshot" (
    "id" TEXT NOT NULL,
    "conversationId" TEXT NOT NULL,
    "data" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Snapshot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ShareRecord" (
    "id" TEXT NOT NULL,
    "runId" TEXT,
    "conversationId" TEXT,
    "sharedBy" TEXT NOT NULL,
    "sharedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ShareRecord_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ExportJob" (
    "id" TEXT NOT NULL,
    "runId" TEXT NOT NULL,
    "status" "ExportStatus" NOT NULL DEFAULT 'PENDING',
    "filePath" TEXT,
    "createdBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),

    CONSTRAINT "ExportJob_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Catalog_catalogDate_idx" ON "Catalog"("catalogDate");

-- CreateIndex
CREATE INDEX "Catalog_uploadedBy_idx" ON "Catalog"("uploadedBy");

-- CreateIndex
CREATE INDEX "CatalogProduct_catalogId_idx" ON "CatalogProduct"("catalogId");

-- CreateIndex
CREATE INDEX "CatalogProduct_externalId_idx" ON "CatalogProduct"("externalId");

-- CreateIndex
CREATE INDEX "Conversation_runId_idx" ON "Conversation"("runId");

-- CreateIndex
CREATE INDEX "Conversation_sessionId_idx" ON "Conversation"("sessionId");

-- CreateIndex
CREATE INDEX "Message_conversationId_idx" ON "Message"("conversationId");

-- CreateIndex
CREATE UNIQUE INDEX "Evaluation_conversationId_key" ON "Evaluation"("conversationId");

-- CreateIndex
CREATE INDEX "Finding_evaluationId_idx" ON "Finding"("evaluationId");

-- CreateIndex
CREATE INDEX "Pattern_evaluationId_idx" ON "Pattern"("evaluationId");

-- CreateIndex
CREATE UNIQUE INDEX "Snapshot_conversationId_key" ON "Snapshot"("conversationId");

-- CreateIndex
CREATE INDEX "ShareRecord_runId_idx" ON "ShareRecord"("runId");

-- CreateIndex
CREATE INDEX "ShareRecord_conversationId_idx" ON "ShareRecord"("conversationId");

-- CreateIndex
CREATE INDEX "ShareRecord_sharedBy_idx" ON "ShareRecord"("sharedBy");

-- CreateIndex
CREATE INDEX "ExportJob_runId_idx" ON "ExportJob"("runId");

-- CreateIndex
CREATE INDEX "ExportJob_createdBy_idx" ON "ExportJob"("createdBy");

-- AddForeignKey
ALTER TABLE "Catalog" ADD CONSTRAINT "Catalog_uploadedBy_fkey" FOREIGN KEY ("uploadedBy") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CatalogProduct" ADD CONSTRAINT "CatalogProduct_catalogId_fkey" FOREIGN KEY ("catalogId") REFERENCES "Catalog"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Conversation" ADD CONSTRAINT "Conversation_runId_fkey" FOREIGN KEY ("runId") REFERENCES "Run"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Message" ADD CONSTRAINT "Message_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "Conversation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Evaluation" ADD CONSTRAINT "Evaluation_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "Conversation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Finding" ADD CONSTRAINT "Finding_evaluationId_fkey" FOREIGN KEY ("evaluationId") REFERENCES "Evaluation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Pattern" ADD CONSTRAINT "Pattern_evaluationId_fkey" FOREIGN KEY ("evaluationId") REFERENCES "Evaluation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Snapshot" ADD CONSTRAINT "Snapshot_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "Conversation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ShareRecord" ADD CONSTRAINT "ShareRecord_runId_fkey" FOREIGN KEY ("runId") REFERENCES "Run"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ShareRecord" ADD CONSTRAINT "ShareRecord_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "Conversation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ShareRecord" ADD CONSTRAINT "ShareRecord_sharedBy_fkey" FOREIGN KEY ("sharedBy") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExportJob" ADD CONSTRAINT "ExportJob_runId_fkey" FOREIGN KEY ("runId") REFERENCES "Run"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExportJob" ADD CONSTRAINT "ExportJob_createdBy_fkey" FOREIGN KEY ("createdBy") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
