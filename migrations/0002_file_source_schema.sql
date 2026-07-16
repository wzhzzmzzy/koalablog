CREATE TABLE `markdown_gate_1c` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`source` integer NOT NULL,
	`path` text NOT NULL,
	`title` text NOT NULL,
	`content` text,
	`tags` text,
	`incoming_links` text,
	`outgoing_links` text,
	`private` integer DEFAULT false NOT NULL,
	`remoteTruth` integer DEFAULT false NOT NULL,
	`revision` integer DEFAULT 1 NOT NULL,
	`createdAt` integer DEFAULT (unixepoch()) NOT NULL,
	`updatedAt` integer DEFAULT (unixepoch()) NOT NULL,
	`deletedAt` integer
);
--> statement-breakpoint
WITH RECURSIVE
`reference_candidates`(`id`, `ordinal`, `path`) AS (
	SELECT
		`markdown`.`id`,
		CAST(`reference`.`key` AS integer),
		CASE
			WHEN `reference`.`type` = 'text' THEN CAST(`reference`.`value` AS text)
			WHEN `reference`.`type` = 'object' AND json_type(`reference`.`value`, '$.link') = 'text'
				THEN json_extract(`reference`.`value`, '$.link')
		END
	FROM `markdown`
	INNER JOIN json_each(
		CASE WHEN json_valid(`markdown`.`outgoing_links`) THEN `markdown`.`outgoing_links` ELSE '[]' END
	) AS `reference`
),
`absolute_references`(`id`, `ordinal`, `path`) AS (
	SELECT
		`id`,
		`ordinal`,
		CASE WHEN substr(`path`, 1, 1) = '/' THEN `path` ELSE '/' || `path` END
	FROM `reference_candidates`
	WHERE `path` IS NOT NULL AND `path` <> '' AND `path` NOT LIKE 'http://%' AND `path` NOT LIKE 'https://%'
),
`normalized_references`(`id`, `ordinal`, `path`) AS (
	SELECT `id`, `ordinal`, `path`
	FROM `absolute_references`
	UNION ALL
	SELECT `id`, `ordinal`, replace(`path`, '//', '/')
	FROM `normalized_references`
	WHERE instr(`path`, '//') > 0
),
`canonical_references`(`id`, `ordinal`, `path`) AS (
	SELECT `id`, `ordinal`, rtrim(`path`, '/')
	FROM `normalized_references`
	WHERE instr(`path`, '//') = 0
),
`aggregated_references`(`id`, `paths`) AS (
	SELECT `id`, json_group_array(`path`)
	FROM (
		SELECT `id`, `path`
		FROM `canonical_references`
		ORDER BY `id`, `ordinal`
	)
	GROUP BY `id`
),
`normalized_paths`(`id`, `path`) AS (
	SELECT
		`id`,
		CASE WHEN substr(`link`, 1, 1) = '/' THEN `link` ELSE '/' || `link` END
	FROM `markdown`
	UNION ALL
	SELECT `id`, replace(`path`, '//', '/')
	FROM `normalized_paths`
	WHERE instr(`path`, '//') > 0
),
`canonical_paths`(`id`, `path`) AS (
	SELECT `id`, rtrim(`path`, '/')
	FROM `normalized_paths`
	WHERE instr(`path`, '//') = 0
),
`path_segments`(`id`, `path`, `rest`, `segment`) AS (
	SELECT `id`, `path`, substr(`path`, 2) || '/', ''
	FROM `canonical_paths`
	UNION ALL
	SELECT
		`id`,
		`path`,
		substr(`rest`, instr(`rest`, '/') + 1),
		substr(`rest`, 1, instr(`rest`, '/') - 1)
	FROM `path_segments`
	WHERE `rest` <> ''
),
`projected_identity`(`id`, `path`, `title`) AS (
	SELECT `id`, `path`, `segment`
	FROM `path_segments`
	WHERE `rest` = ''
)
INSERT INTO `markdown_gate_1c` (
	`id`, `source`, `path`, `title`, `content`, `tags`, `incoming_links`, `outgoing_links`,
	`private`, `remoteTruth`, `revision`, `createdAt`, `updatedAt`, `deletedAt`
)
SELECT
	`markdown`.`id`,
	`markdown`.`source`,
	`projected_identity`.`path`,
	`projected_identity`.`title`,
	`markdown`.`content`,
	`markdown`.`tags`,
	`markdown`.`incoming_links`,
	CASE
		WHEN `markdown`.`outgoing_links` IS NULL THEN NULL
		WHEN json_valid(`markdown`.`outgoing_links`) THEN coalesce(`aggregated_references`.`paths`, '[]')
		ELSE `markdown`.`outgoing_links`
	END,
	`markdown`.`private`,
	`markdown`.`remoteTruth`,
	1,
	`markdown`.`createdAt`,
	`markdown`.`updatedAt`,
	`markdown`.`deletedAt`
FROM `markdown`
INNER JOIN `projected_identity` ON `projected_identity`.`id` = `markdown`.`id`
LEFT JOIN `aggregated_references` ON `aggregated_references`.`id` = `markdown`.`id`
ORDER BY `markdown`.`id`;
--> statement-breakpoint
DROP TABLE `markdown`;
--> statement-breakpoint
ALTER TABLE `markdown_gate_1c` RENAME TO `markdown`;
--> statement-breakpoint
CREATE UNIQUE INDEX `markdown_active_path_unique` ON `markdown` (`path`) WHERE `markdown`.`deletedAt` IS NULL;
--> statement-breakpoint
CREATE INDEX `markdown_deleted_at_idx` ON `markdown` (`deletedAt`);
