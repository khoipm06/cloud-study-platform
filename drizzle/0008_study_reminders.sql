CREATE TABLE `push_deliveries` (
	`notification_id` text NOT NULL,
	`subscription_id` text NOT NULL,
	`status` text DEFAULT 'PENDING' NOT NULL,
	`attempts` integer DEFAULT 0 NOT NULL,
	`next_attempt_at` text NOT NULL,
	`last_status` integer,
	PRIMARY KEY(`notification_id`, `subscription_id`),
	FOREIGN KEY (`notification_id`) REFERENCES `learning_notifications`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`subscription_id`) REFERENCES `push_subscriptions`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `push_due` ON `push_deliveries` (`status`,`next_attempt_at`);--> statement-breakpoint
CREATE TABLE `push_subscriptions` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`endpoint` text NOT NULL,
	`p256dh` text NOT NULL,
	`auth` text NOT NULL,
	`label` text NOT NULL,
	`created_at` text NOT NULL,
	`last_success_at` text,
	`last_status` integer,
	`test_after` text,
	FOREIGN KEY (`user_id`) REFERENCES `members`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `push_subscriptions_endpoint_unique` ON `push_subscriptions` (`endpoint`);--> statement-breakpoint
CREATE INDEX `push_user` ON `push_subscriptions` (`user_id`);