CREATE TABLE `members` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`email` text NOT NULL,
	`role` text DEFAULT 'LEARNER' NOT NULL,
	`blocked` integer DEFAULT 0 NOT NULL,
	`goal` integer DEFAULT 5 NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `settings` (
	`key` text PRIMARY KEY NOT NULL,
	`value` text NOT NULL
);
