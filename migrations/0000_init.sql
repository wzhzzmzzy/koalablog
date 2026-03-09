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
	`deleted` integer DEFAULT false NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `markdown_link_unique` ON `markdown` (`link`);--> statement-breakpoint
CREATE UNIQUE INDEX `markdown_subject_unique` ON `markdown` (`subject`);--> statement-breakpoint
CREATE TABLE `oss_access` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`date` text NOT NULL,
	`readTimes` integer DEFAULT 0,
	`operateTimes` integer DEFAULT 0
);
--> statement-breakpoint
CREATE UNIQUE INDEX `oss_access_date_unique` ON `oss_access` (`date`);
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
CREATE TABLE `markdown_renders` (
	`markdown_id` integer PRIMARY KEY NOT NULL,
	`html_content` text NOT NULL,
	`updated_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`markdown_id`) REFERENCES `markdown`(`id`) ON UPDATE no action ON DELETE cascade
);
