PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_markdown` (
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
INSERT INTO `__new_markdown`("id", "source", "path", "title", "renderer", "content", "sourceHash", "tags", "incoming_links", "outgoing_links", "private", "remoteTruth", "revision", "createdAt", "updatedAt", "deletedAt") SELECT "id", "source", "path", "title", "renderer", "content", "sourceHash", "tags", "incoming_links", "outgoing_links", "private", "remoteTruth", "revision", "createdAt", "updatedAt", "deletedAt" FROM `markdown`;--> statement-breakpoint
DROP TABLE `markdown`;--> statement-breakpoint
ALTER TABLE `__new_markdown` RENAME TO `markdown`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE UNIQUE INDEX `markdown_active_path_unique` ON `markdown` (`path`) WHERE "markdown"."deletedAt" IS NULL;--> statement-breakpoint
CREATE INDEX `markdown_deleted_at_idx` ON `markdown` (`deletedAt`);