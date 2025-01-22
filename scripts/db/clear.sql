-- Drop all tables and indexes in local db
DROP TABLE IF EXISTS "_MarkdownToTag";
DROP TABLE IF EXISTS "Markdown";
DROP TABLE IF EXISTS "Tag";
DROP TABLE IF EXISTS "d1_migrations";

-- Drop indexes
DROP INDEX IF EXISTS "markdown_link_unique";
DROP INDEX IF EXISTS "markdown_subject_unique";
