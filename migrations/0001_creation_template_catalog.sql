CREATE TABLE `creation_template_catalog` (
	`key` text PRIMARY KEY NOT NULL,
	`schemaVersion` integer NOT NULL,
	`revision` integer NOT NULL,
	`payload` text NOT NULL,
	`createdAt` integer DEFAULT (unixepoch()) NOT NULL,
	`updatedAt` integer DEFAULT (unixepoch()) NOT NULL
);
