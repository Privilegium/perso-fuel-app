CREATE TABLE `push_subscriptions` (
	`id` text PRIMARY KEY NOT NULL,
	`endpoint` text NOT NULL,
	`p256dh` text NOT NULL,
	`auth` text NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `push_subscriptions_endpoint_unique` ON `push_subscriptions` (`endpoint`);--> statement-breakpoint
CREATE TABLE `reminder_deliveries` (
	`id` text PRIMARY KEY NOT NULL,
	`sent_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE TABLE `service_items` (
	`id` text PRIMARY KEY NOT NULL,
	`title` text NOT NULL,
	`kind` text NOT NULL,
	`interval_months` integer,
	`interval_km` integer,
	`reminders` integer DEFAULT false NOT NULL
);
--> statement-breakpoint
CREATE TABLE `service_records` (
	`id` text PRIMARY KEY NOT NULL,
	`service_id` text NOT NULL,
	`performed_on` text NOT NULL,
	`odometer` real,
	`action` text NOT NULL,
	`note` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`service_id`) REFERENCES `service_items`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `service_records_service_date_idx` ON `service_records` (`service_id`,`performed_on`);