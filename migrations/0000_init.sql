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