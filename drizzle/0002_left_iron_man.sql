ALTER TABLE `readiness_leads` ADD `scorecard_sent_at` integer;--> statement-breakpoint
ALTER TABLE `readiness_leads` ADD `scorecard_status` text;--> statement-breakpoint
ALTER TABLE `readiness_leads` ADD `scorecard_error` text;--> statement-breakpoint
ALTER TABLE `readiness_leads` ADD `mail_due_at` integer;--> statement-breakpoint
ALTER TABLE `readiness_leads` ADD `mail_attempts` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `readiness_leads` ADD `mail_lease` text;--> statement-breakpoint
ALTER TABLE `readiness_leads` ADD `owner_sent_at` integer;--> statement-breakpoint
ALTER TABLE `readiness_leads` ADD `owner_attempts` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `readiness_leads` ADD `owner_error` text;--> statement-breakpoint
CREATE INDEX `readiness_leads_due_idx` ON `readiness_leads` (`mail_due_at`);