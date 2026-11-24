CREATE TABLE `inquiries` (
	`id` text PRIMARY KEY NOT NULL,
	`request_hash` text NOT NULL,
	`name` text NOT NULL,
	`email` text NOT NULL,
	`company` text DEFAULT '' NOT NULL,
	`interest` text NOT NULL,
	`message` text NOT NULL,
	`created_at` integer NOT NULL,
	`status` text DEFAULT 'new' NOT NULL,
	CONSTRAINT "inquiries_interest_check" CHECK("inquiries"."interest" IN ('demo', 'enterprise', 'local'))
);
--> statement-breakpoint
CREATE INDEX `inquiries_email_created_idx` ON `inquiries` (`email`,`created_at`);--> statement-breakpoint
CREATE INDEX `inquiries_created_idx` ON `inquiries` (`created_at`);