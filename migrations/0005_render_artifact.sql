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
