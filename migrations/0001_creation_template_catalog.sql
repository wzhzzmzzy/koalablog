CREATE TABLE `creation_template_catalog` (
	`key` text PRIMARY KEY NOT NULL,
	`schemaVersion` integer NOT NULL,
	`revision` integer NOT NULL,
	`payload` text NOT NULL,
	`createdAt` integer DEFAULT (unixepoch()) NOT NULL,
	`updatedAt` integer DEFAULT (unixepoch()) NOT NULL
);
--> statement-breakpoint
INSERT INTO `creation_template_catalog` (`key`, `schemaVersion`, `revision`, `payload`)
VALUES ('koala:creation-templates', 1, 1, '[{"id":"memo-default","prefix":"/memo/","titlePattern":"{{datetime:yyyyMMddHHmm}}{{uniqueSuffix}}","pathPattern":"{{targetPrefix}}/{{title}}","content":""}]')
ON CONFLICT (`key`) DO NOTHING;
