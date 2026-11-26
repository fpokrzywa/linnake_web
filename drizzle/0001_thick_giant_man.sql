CREATE TABLE `readiness_leads` (
	`id` text PRIMARY KEY NOT NULL,
	`request_hash` text NOT NULL,
	`first_name` text NOT NULL,
	`email` text NOT NULL,
	`company_size` text NOT NULL,
	`use_case` text NOT NULL,
	`hardware` text NOT NULL,
	`score` integer NOT NULL,
	`size_points` integer NOT NULL,
	`task_points` integer NOT NULL,
	`hardware_points` integer NOT NULL,
	`created_at` integer NOT NULL,
	`status` text DEFAULT 'new' NOT NULL,
	CONSTRAINT "readiness_leads_score_check" CHECK("readiness_leads"."score" BETWEEN 0 AND 100)
);
--> statement-breakpoint
CREATE INDEX `readiness_leads_email_created_idx` ON `readiness_leads` (`email`,`created_at`);--> statement-breakpoint
CREATE INDEX `readiness_leads_status_created_idx` ON `readiness_leads` (`status`,`created_at`);