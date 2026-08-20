-- Optional post-deploy data migration for Markdown Effective Tags.
--
-- Preconditions:
--   1. Deploy the JSON/CSV dual-read application before running this file.
--   2. Run scripts/audit/markdown-tags.mjs against a read-only production snapshot.
--   3. Keep a D1 Time Travel bookmark or a SQLite backup.
--
-- No DDL is required: markdown.tags remains TEXT. This script converts only
-- unambiguously legacy comma-separated values. JSON arrays, empty values, and
-- malformed structured values are left unchanged. Do not run this before the
-- compatible application is live because older versions interpret JSON as CSV.

-- Pre-migration classification. Save this output as release evidence.
SELECT
  count(*) AS markdown_rows,
  sum(CASE
    WHEN tags IS NOT NULL
      AND trim(tags) <> ''
      AND json_valid(tags) = 0
      AND substr(ltrim(tags), 1, 1) NOT IN ('[', '{', '"')
    THEN 1 ELSE 0
  END) AS convertible_csv_rows,
  sum(CASE
    WHEN json_valid(tags) = 1 AND json_type(tags) = 'array'
    THEN 1 ELSE 0
  END) AS json_array_rows,
  sum(CASE
    WHEN tags IS NOT NULL
      AND trim(tags) <> ''
      AND (
        (json_valid(tags) = 1 AND json_type(tags) <> 'array')
        OR (json_valid(tags) = 0 AND substr(ltrim(tags), 1, 1) IN ('[', '{', '"'))
      )
    THEN 1 ELSE 0
  END) AS malformed_structured_rows
FROM markdown
WHERE renderer = 'markdown';

WITH RECURSIVE
legacy(id, original, rest, json_body, item_count) AS (
  SELECT
    id,
    tags,
    tags || ',',
    '',
    0
  FROM markdown
  WHERE renderer = 'markdown'
    AND tags IS NOT NULL
    AND trim(tags) <> ''
    AND json_valid(tags) = 0
    AND substr(ltrim(tags), 1, 1) NOT IN ('[', '{', '"')

  UNION ALL

  SELECT
    id,
    original,
    substr(rest, instr(rest, ',') + 1),
    CASE
      WHEN trim(substr(rest, 1, instr(rest, ',') - 1)) = '' THEN json_body
      ELSE json_body
        || CASE WHEN item_count > 0 THEN ',' ELSE '' END
        || json_quote(trim(substr(rest, 1, instr(rest, ',') - 1)))
    END,
    item_count + CASE
      WHEN trim(substr(rest, 1, instr(rest, ',') - 1)) = '' THEN 0
      ELSE 1
    END
  FROM legacy
  WHERE rest <> ''
),
converted(id, original, tags_json) AS (
  SELECT id, original, '[' || json_body || ']'
  FROM legacy
  WHERE rest = ''
)
UPDATE markdown
SET tags = (
  SELECT tags_json
  FROM converted
  WHERE converted.id = markdown.id
)
WHERE id IN (SELECT id FROM converted)
  AND tags = (
    SELECT original
    FROM converted
    WHERE converted.id = markdown.id
  );

SELECT changes() AS converted_rows;

-- Post-migration verification. convertible_csv_rows must be zero. Rows counted
-- as malformed_structured_rows are intentionally unchanged and need review.
SELECT
  count(*) AS markdown_rows,
  sum(CASE
    WHEN tags IS NOT NULL
      AND trim(tags) <> ''
      AND json_valid(tags) = 0
      AND substr(ltrim(tags), 1, 1) NOT IN ('[', '{', '"')
    THEN 1 ELSE 0
  END) AS convertible_csv_rows,
  sum(CASE
    WHEN json_valid(tags) = 1 AND json_type(tags) = 'array'
    THEN 1 ELSE 0
  END) AS json_array_rows,
  sum(CASE
    WHEN tags IS NOT NULL
      AND trim(tags) <> ''
      AND (
        (json_valid(tags) = 1 AND json_type(tags) <> 'array')
        OR (json_valid(tags) = 0 AND substr(ltrim(tags), 1, 1) IN ('[', '{', '"'))
      )
    THEN 1 ELSE 0
  END) AS malformed_structured_rows
FROM markdown
WHERE renderer = 'markdown';
