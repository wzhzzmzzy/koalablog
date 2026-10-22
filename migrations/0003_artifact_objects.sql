ALTER TABLE `markdown_render` ADD COLUMN `javascriptKey` text;
--> statement-breakpoint
ALTER TABLE `markdown_render` ADD COLUMN `cssKey` text;
--> statement-breakpoint
ALTER TABLE `markdown_render` DROP COLUMN `snapshotHtml`;
--> statement-breakpoint
UPDATE `markdown_render` SET `schemaVersion` = 2 WHERE `schemaVersion` = 1;
