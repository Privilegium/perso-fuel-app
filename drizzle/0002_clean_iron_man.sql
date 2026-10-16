CREATE TABLE `finance_exports` (
	`fuel_id` text PRIMARY KEY NOT NULL,
	`payload` text NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`message` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
