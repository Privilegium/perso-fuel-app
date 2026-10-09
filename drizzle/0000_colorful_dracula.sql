CREATE TABLE `fuel_entries` (
	`id` text PRIMARY KEY NOT NULL,
	`source_notion_id` text,
	`source_notion_url` text,
	`fill_date` text,
	`unit_price` real,
	`amount` real,
	`liters` real,
	`odometer` real,
	`latitude` real,
	`longitude` real,
	`location_accuracy` real,
	`note` text,
	`legacy_status` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `fuel_entries_source_notion_id_unique` ON `fuel_entries` (`source_notion_id`);--> statement-breakpoint
CREATE INDEX `fuel_entries_fill_date_idx` ON `fuel_entries` (`fill_date`);