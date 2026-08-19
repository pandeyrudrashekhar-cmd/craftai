-- Preserve existing project records while adopting the Phase 2 API contract.
ALTER TABLE "Project" RENAME COLUMN "name" TO "title";

CREATE TYPE "ProjectStatus" AS ENUM ('DRAFT', 'ACTIVE', 'ARCHIVED');

ALTER TABLE "Project"
  ADD COLUMN "thumbnail" TEXT,
  ADD COLUMN "framework" TEXT NOT NULL DEFAULT 'React',
  ADD COLUMN "status" "ProjectStatus" NOT NULL DEFAULT 'DRAFT';
