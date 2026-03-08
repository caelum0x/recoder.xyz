-- CreateTable
CREATE TABLE "ecosystem_tags" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "color" TEXT,
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ecosystem_tags_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ecosystem_tag_items" (
    "id" TEXT NOT NULL,
    "tagId" TEXT NOT NULL,
    "sourceApp" TEXT NOT NULL,
    "externalId" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "itemType" TEXT NOT NULL,
    "itemUrl" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ecosystem_tag_items_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ecosystem_tags_userId_slug_key" ON "ecosystem_tags"("userId", "slug");

-- CreateIndex
CREATE INDEX "ecosystem_tags_userId_idx" ON "ecosystem_tags"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "ecosystem_tag_items_tagId_sourceApp_externalId_key" ON "ecosystem_tag_items"("tagId", "sourceApp", "externalId");

-- CreateIndex
CREATE INDEX "ecosystem_tag_items_tagId_idx" ON "ecosystem_tag_items"("tagId");

-- AddForeignKey
ALTER TABLE "ecosystem_tags" ADD CONSTRAINT "ecosystem_tags_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ecosystem_tag_items" ADD CONSTRAINT "ecosystem_tag_items_tagId_fkey" FOREIGN KEY ("tagId") REFERENCES "ecosystem_tags"("id") ON DELETE CASCADE ON UPDATE CASCADE;
