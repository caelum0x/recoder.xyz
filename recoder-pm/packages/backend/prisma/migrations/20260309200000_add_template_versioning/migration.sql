-- AlterTable: add version and parentTemplateId to template
ALTER TABLE "template" ADD COLUMN "version" INTEGER NOT NULL DEFAULT 1;
ALTER TABLE "template" ADD COLUMN "parentTemplateId" VARCHAR(191);

-- CreateIndex
CREATE INDEX "template_parentTemplateId_idx" ON "template"("parentTemplateId");

-- AddForeignKey
ALTER TABLE "template" ADD CONSTRAINT "template_parentTemplateId_fkey" FOREIGN KEY ("parentTemplateId") REFERENCES "template"("id") ON DELETE SET NULL ON UPDATE CASCADE;
