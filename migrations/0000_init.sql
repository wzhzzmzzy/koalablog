CREATE TABLE `markdown` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`source` integer NOT NULL,
	`path` text NOT NULL,
	`title` text NOT NULL,
	`renderer` text DEFAULT 'markdown' NOT NULL,
	`content` text NOT NULL,
	`sourceHash` text NOT NULL,
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
CREATE UNIQUE INDEX `markdown_active_path_unique` ON `markdown` (`path`) WHERE "markdown"."deletedAt" IS NULL;
--> statement-breakpoint
CREATE INDEX `markdown_deleted_at_idx` ON `markdown` (`deletedAt`);
--> statement-breakpoint
CREATE TABLE `oss_access` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`date` text NOT NULL,
	`readTimes` integer DEFAULT 0,
	`operateTimes` integer DEFAULT 0
);
--> statement-breakpoint
CREATE UNIQUE INDEX `oss_access_date_unique` ON `oss_access` (`date`);
--> statement-breakpoint
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
--> statement-breakpoint
CREATE TABLE `creation_template_catalog` (
	`key` text PRIMARY KEY NOT NULL,
	`schemaVersion` integer NOT NULL,
	`revision` integer NOT NULL,
	`payload` text NOT NULL,
	`createdAt` integer DEFAULT (unixepoch()) NOT NULL,
	`updatedAt` integer DEFAULT (unixepoch()) NOT NULL
);
--> statement-breakpoint
CREATE TABLE `markdown_render` (
	`fileId` integer PRIMARY KEY NOT NULL,
	`schemaVersion` integer NOT NULL,
	`renderer` text NOT NULL,
	`svelteVersion` text NOT NULL,
	`unocssVersion` text NOT NULL,
	`unocssConfigHash` text NOT NULL,
	`sourceHash` text NOT NULL,
	`dependencies` text NOT NULL,
	`artifactHash` text NOT NULL,
	`javascriptResourceHash` text NOT NULL,
	`cssResourceHash` text NOT NULL,
	`javascript` text NOT NULL,
	`css` text NOT NULL,
	`snapshotHtml` text NOT NULL,
	`createdAt` integer DEFAULT (unixepoch()) NOT NULL,
	`updatedAt` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`fileId`) REFERENCES `markdown`(`id`) ON UPDATE no action ON DELETE cascade
);
