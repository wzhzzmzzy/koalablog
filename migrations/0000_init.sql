CREATE TABLE `markdown` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`source` integer NOT NULL,
	`link` text NOT NULL,
	`subject` text NOT NULL,
	`content` text,
	`tags` text,
	`incoming_links` text,
	`outgoing_links` text,
	`createdAt` integer DEFAULT (CURRENT_TIMESTAMP) NOT NULL,
	`updatedAt` integer DEFAULT (CURRENT_TIMESTAMP) NOT NULL,
	`deleted` integer DEFAULT false NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `markdown_link_unique` ON `markdown` (`link`);--> statement-breakpoint
CREATE UNIQUE INDEX `markdown_subject_unique` ON `markdown` (`subject`);


