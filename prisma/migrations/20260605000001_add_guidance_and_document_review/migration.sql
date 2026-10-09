-- Migration: add_guidance_and_document_review
-- Sprint LC-01: coverage for GuidanceTask, GuidanceCase, GuidanceCaseEvent,
--               UserPersonaProfile, DecisionEvaluation, and Document review fields.
-- All operations are purely additive. No DROP, no data destruction.

-- ─────────────────────────────────────────────────────────────
-- ENUMS
-- ─────────────────────────────────────────────────────────────

CREATE TYPE "GuidanceTaskStatus" AS ENUM ('OPEN', 'IN_PROGRESS', 'COMPLETED', 'DISMISSED');

CREATE TYPE "GuidanceTaskPriority" AS ENUM ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL');

CREATE TYPE "GuidanceTaskCategory" AS ENUM (
  'UPLOAD_DOCUMENT',
  'ADD_TRANSACTION',
  'CATEGORIZE_EXPENSE',
  'COMPLETE_PROFILE',
  'REVIEW_REPORT',
  'CONTACT_STEUERBERATER',
  'RESOLVE_CASE',
  'OTHER'
);

CREATE TYPE "GuidanceCaseType" AS ENUM (
  'FINANZAMT',
  'JOBCENTER',
  'PAYMENT',
  'DOCUMENT_REQUEST',
  'OTHER'
);

CREATE TYPE "GuidanceCaseStatus" AS ENUM (
  'OPEN',
  'ACTION_REQUIRED',
  'WAITING_FOR_DOCUMENTS',
  'READY_FOR_REVIEW',
  'ESCALATED',
  'RESOLVED'
);

CREATE TYPE "GuidanceCaseEventType" AS ENUM (
  'LETTER_UPLOADED',
  'OCR_COMPLETED',
  'DEADLINE_DETECTED',
  'DOCUMENT_MISSING',
  'USER_UPLOADED_RECEIPT',
  'CONFIDENCE_IMPROVED',
  'ESCALATION_RECOMMENDED',
  'CASE_RESOLVED',
  'STATUS_CHANGED'
);

CREATE TYPE "BusinessType" AS ENUM (
  'FREELANCER',
  'RESTAURANT',
  'CONSTRUCTION',
  'DRIVER',
  'RETAIL',
  'CREATIVE',
  'CONSULTANT',
  'OTHER'
);

CREATE TYPE "PaymentStyle" AS ENUM ('CASH_HEAVY', 'TRANSFER_HEAVY', 'MIXED');

CREATE TYPE "GuidanceComplexity" AS ENUM ('SIMPLE', 'STANDARD', 'ADVANCED');

CREATE TYPE "BureaucracyConfidence" AS ENUM ('LOW', 'MEDIUM', 'HIGH');

CREATE TYPE "OrganizationLevel" AS ENUM ('OVERWHELMED', 'IMPROVING', 'ORGANIZED');

-- ─────────────────────────────────────────────────────────────
-- AlterTable: Document — add review fields (all nullable)
-- ─────────────────────────────────────────────────────────────

ALTER TABLE "Document"
  ADD COLUMN "reviewStatus"        TEXT,
  ADD COLUMN "approvedAt"          TIMESTAMP(3),
  ADD COLUMN "correctionData"      JSONB,
  ADD COLUMN "linkedTransactionId" TEXT;

-- ─────────────────────────────────────────────────────────────
-- CreateTable: GuidanceTask
-- ─────────────────────────────────────────────────────────────

CREATE TABLE "GuidanceTask" (
    "id"             TEXT NOT NULL,
    "userId"         TEXT NOT NULL,
    "caseId"         TEXT,
    "taskKey"        TEXT NOT NULL,
    "title"          TEXT NOT NULL,
    "description"    TEXT NOT NULL,
    "status"         "GuidanceTaskStatus"   NOT NULL DEFAULT 'OPEN',
    "priority"       "GuidanceTaskPriority" NOT NULL DEFAULT 'MEDIUM',
    "category"       "GuidanceTaskCategory" NOT NULL,
    "relatedSection" TEXT,
    "dueDate"        TIMESTAMP(3),
    "completedAt"    TIMESTAMP(3),
    "createdAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"      TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GuidanceTask_pkey" PRIMARY KEY ("id")
);

-- ─────────────────────────────────────────────────────────────
-- CreateTable: GuidanceCase
-- ─────────────────────────────────────────────────────────────

CREATE TABLE "GuidanceCase" (
    "id"                    TEXT NOT NULL,
    "userId"                TEXT NOT NULL,
    "title"                 TEXT NOT NULL,
    "caseType"              "GuidanceCaseType"   NOT NULL,
    "status"                "GuidanceCaseStatus" NOT NULL DEFAULT 'OPEN',
    "urgency"               TEXT NOT NULL,
    "openedAt"              TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolvedAt"            TIMESTAMP(3),
    "confidenceLevel"       TEXT NOT NULL,
    "preparationStatus"     TEXT NOT NULL,
    "escalationRecommended" BOOLEAN NOT NULL DEFAULT false,
    "summary"               TEXT NOT NULL,
    "detectedLetterType"    TEXT,
    "latestDeadline"        TIMESTAMP(3),
    "documentId"            TEXT,
    "createdAt"             TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"             TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GuidanceCase_pkey" PRIMARY KEY ("id")
);

-- ─────────────────────────────────────────────────────────────
-- CreateTable: GuidanceCaseEvent
-- ─────────────────────────────────────────────────────────────

CREATE TABLE "GuidanceCaseEvent" (
    "id"          TEXT NOT NULL,
    "caseId"      TEXT NOT NULL,
    "eventType"   "GuidanceCaseEventType" NOT NULL,
    "title"       TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "metadata"    JSONB,
    "createdAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "GuidanceCaseEvent_pkey" PRIMARY KEY ("id")
);

-- ─────────────────────────────────────────────────────────────
-- CreateTable: UserPersonaProfile
-- ─────────────────────────────────────────────────────────────

CREATE TABLE "UserPersonaProfile" (
    "id"                     TEXT NOT NULL,
    "userId"                 TEXT NOT NULL,
    "businessType"           "BusinessType"         NOT NULL DEFAULT 'OTHER',
    "industryCategory"       TEXT,
    "businessDescription"    TEXT,
    "employeeCount"          INTEGER NOT NULL DEFAULT 0,
    "paymentStyle"           "PaymentStyle"         NOT NULL DEFAULT 'MIXED',
    "cashPercentage"         INTEGER,
    "invoicePercentage"      INTEGER,
    "transferPercentage"     INTEGER,
    "operatingDaysPerWeek"   INTEGER,
    "averageMonthlyRevenue"  DECIMAL(12,2),
    "averageMonthlyExpenses" DECIMAL(12,2),
    "seasonalBusiness"       BOOLEAN NOT NULL DEFAULT false,
    "highSeasonMonths"       TEXT,
    "lowSeasonMonths"        TEXT,
    "guidanceComplexity"     "GuidanceComplexity"   NOT NULL DEFAULT 'STANDARD',
    "bureaucracyConfidence"  "BureaucracyConfidence" NOT NULL DEFAULT 'MEDIUM',
    "organizationLevel"      "OrganizationLevel"    NOT NULL DEFAULT 'IMPROVING',
    "createdAt"              TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"              TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UserPersonaProfile_pkey" PRIMARY KEY ("id")
);

-- ─────────────────────────────────────────────────────────────
-- CreateTable: DecisionEvaluation
-- ─────────────────────────────────────────────────────────────

CREATE TABLE "DecisionEvaluation" (
    "id"              TEXT NOT NULL,
    "userId"          TEXT NOT NULL,
    "decisionType"    TEXT NOT NULL,
    "amount"          DECIMAL(12,2) NOT NULL,
    "purpose"         TEXT NOT NULL,
    "note"            TEXT,
    "resultLevel"     TEXT NOT NULL,
    "confidenceLevel" TEXT NOT NULL,
    "summary"         TEXT NOT NULL,
    "reasons"         JSONB NOT NULL,
    "missingData"     JSONB,
    "obligations"     JSONB,
    "riskSignals"     JSONB,
    "createdAt"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DecisionEvaluation_pkey" PRIMARY KEY ("id")
);

-- ─────────────────────────────────────────────────────────────
-- INDEXES
-- ─────────────────────────────────────────────────────────────

CREATE UNIQUE INDEX "GuidanceTask_userId_taskKey_key"      ON "GuidanceTask"("userId", "taskKey");
CREATE INDEX        "GuidanceTask_userId_status_idx"       ON "GuidanceTask"("userId", "status");

CREATE INDEX        "GuidanceCase_userId_status_idx"       ON "GuidanceCase"("userId", "status");
CREATE INDEX        "GuidanceCase_userId_createdAt_idx"    ON "GuidanceCase"("userId", "createdAt");

CREATE UNIQUE INDEX "UserPersonaProfile_userId_key"        ON "UserPersonaProfile"("userId");

CREATE INDEX        "DecisionEvaluation_userId_createdAt_idx" ON "DecisionEvaluation"("userId", "createdAt");

-- ─────────────────────────────────────────────────────────────
-- FOREIGN KEYS
-- ─────────────────────────────────────────────────────────────

ALTER TABLE "GuidanceTask"
  ADD CONSTRAINT "GuidanceTask_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "GuidanceCase"
  ADD CONSTRAINT "GuidanceCase_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "GuidanceCaseEvent"
  ADD CONSTRAINT "GuidanceCaseEvent_caseId_fkey"
  FOREIGN KEY ("caseId") REFERENCES "GuidanceCase"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "UserPersonaProfile"
  ADD CONSTRAINT "UserPersonaProfile_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "DecisionEvaluation"
  ADD CONSTRAINT "DecisionEvaluation_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;
