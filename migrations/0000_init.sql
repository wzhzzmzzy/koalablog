CREATE TABLE `markdown` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`source` integer NOT NULL,
	`link` text NOT NULL,
	`subject` text NOT NULL,
	`content` text,
	`tags` text,
	`incoming_links` text,
	`outgoing_links` text,
	`private` integer DEFAULT false NOT NULL,
	`createdAt` integer DEFAULT (unixepoch()) NOT NULL,
	`updatedAt` integer DEFAULT (unixepoch()) NOT NULL,
	`remoteTruth` integer DEFAULT false NOT NULL,
	`deletedAt` integer
);
--> statement-breakpoint
CREATE UNIQUE INDEX `markdown_active_link_unique` ON `markdown` (`link`) WHERE "markdown"."deletedAt" IS NULL;--> statement-breakpoint
CREATE UNIQUE INDEX `markdown_active_subject_unique` ON `markdown` (`subject`) WHERE "markdown"."deletedAt" IS NULL;--> statement-breakpoint
CREATE INDEX `markdown_deleted_at_idx` ON `markdown` (`deletedAt`);--> statement-breakpoint
CREATE TABLE `oss_access` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`date` text NOT NULL,
	`readTimes` integer DEFAULT 0,
	`operateTimes` integer DEFAULT 0
);
--> statement-breakpoint
CREATE UNIQUE INDEX `oss_access_date_unique` ON `oss_access` (`date`);--> statement-breakpoint
CREATE TABLE `blob_storage` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`key` text NOT NULL,
	`contentType` text NOT NULL,
	`size` integer NOT NULL,
	`data` text NOT NULL,
	`metadata` text,
	`uploadedAt` integer DEFAULT (unixepoch()) NOT NULL,
	`updatedAt` integer DEFAULT (unixepoch()) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `blob_storage_key_unique` ON `blob_storage` (`key`);
