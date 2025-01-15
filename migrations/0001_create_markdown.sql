-- CreateTable
CREATE TABLE "Markdown" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    -- Home = 1, Nav = 2, Post = 10, Page = 20
    "source" INTEGER NOT NULL,
    "subject" TEXT NOT NULL,
    "content" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deleted" BOOLEAN NOT NULL DEFAULT false
);

-- CreateTable
CREATE TABLE "Tag" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "name" TEXT NOT NULL
);

-- CreateTable
CREATE TABLE "_MarkdownToTag" (
    "A" INTEGER NOT NULL,
    "B" INTEGER NOT NULL,
    CONSTRAINT "_MarkdownToTag_A_fkey" FOREIGN KEY ("A") REFERENCES "Markdown" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "_MarkdownToTag_B_fkey" FOREIGN KEY ("B") REFERENCES "Tag" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "Markdown_subject_key" ON "Markdown"("subject");

-- CreateIndex
CREATE UNIQUE INDEX "Tag_name_key" ON "Tag"("name");

-- CreateIndex
CREATE UNIQUE INDEX "_MarkdownToTag_AB_unique" ON "_MarkdownToTag"("A", "B");

-- CreateIndex
CREATE INDEX "_MarkdownToTag_B_index" ON "_MarkdownToTag"("B");
