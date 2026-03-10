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