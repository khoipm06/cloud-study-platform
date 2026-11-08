CREATE TABLE `auth_accounts` (
	`user_id` text PRIMARY KEY NOT NULL,
	`email` text NOT NULL,
	`password_hash` text NOT NULL,
	`status` text DEFAULT 'PENDING' NOT NULL,
	`approved_by` text,
	`approved_at` text,
	`version` integer DEFAULT 1 NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `members`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `auth_accounts_email_unique` ON `auth_accounts` (`email`);--> statement-breakpoint
CREATE TABLE `auth_rate_limits` (
	`key` text PRIMARY KEY NOT NULL,
	`attempts` integer NOT NULL,
	`expires_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `auth_sessions` (
	`token_hash` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`credential_version` integer NOT NULL,
	`created_at` text NOT NULL,
	`expires_at` text NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `auth_accounts`(`user_id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `auth_sessions_user` ON `auth_sessions` (`user_id`);--> statement-breakpoint
CREATE TABLE `certificates` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`course_id` text NOT NULL,
	`learner_name` text NOT NULL,
	`course_title` text NOT NULL,
	`score` integer NOT NULL,
	`required_count` integer NOT NULL,
	`issued_at` text NOT NULL,
	`shared` integer DEFAULT 0 NOT NULL,
	`revoked_at` text,
	`revocation_reason` text,
	`version` integer DEFAULT 1 NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `members`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`course_id`) REFERENCES `courses`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `one_certificate_per_course` ON `certificates` (`user_id`,`course_id`);--> statement-breakpoint
CREATE TABLE `community_files` (
	`id` text PRIMARY KEY NOT NULL,
	`course_id` text NOT NULL,
	`owner_id` text NOT NULL,
	`post_id` text,
	`message_id` text,
	`object_key` text NOT NULL,
	`name` text NOT NULL,
	`mime` text NOT NULL,
	`size` integer NOT NULL,
	`status` text DEFAULT 'PENDING' NOT NULL,
	`reviewed_by` text,
	`review_reason` text DEFAULT '' NOT NULL,
	`scan_result` text,
	`version` integer DEFAULT 1 NOT NULL,
	`created_at` text NOT NULL,
	`detached_at` text,
	FOREIGN KEY (`course_id`) REFERENCES `courses`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`owner_id`) REFERENCES `members`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`post_id`) REFERENCES `discussion_posts`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`message_id`) REFERENCES `direct_messages`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `community_file_status` ON `community_files` (`status`,`created_at`);--> statement-breakpoint
CREATE TABLE `conversation_blocks` (
	`user_id` text NOT NULL,
	`blocked_user_id` text NOT NULL,
	`created_at` text NOT NULL,
	PRIMARY KEY(`user_id`, `blocked_user_id`),
	FOREIGN KEY (`user_id`) REFERENCES `members`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`blocked_user_id`) REFERENCES `members`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `conversations` (
	`id` text PRIMARY KEY NOT NULL,
	`course_id` text NOT NULL,
	`participant_a` text NOT NULL,
	`participant_b` text NOT NULL,
	`last_message_at` text NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`course_id`) REFERENCES `courses`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`participant_a`) REFERENCES `members`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`participant_b`) REFERENCES `members`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `one_course_conversation` ON `conversations` (`course_id`,`participant_a`,`participant_b`);--> statement-breakpoint
CREATE TABLE `direct_messages` (
	`id` text PRIMARY KEY NOT NULL,
	`conversation_id` text NOT NULL,
	`sender_id` text NOT NULL,
	`body` text NOT NULL,
	`deleted` integer DEFAULT 0 NOT NULL,
	`version` integer DEFAULT 1 NOT NULL,
	`created_at` text NOT NULL,
	`read_at` text,
	FOREIGN KEY (`conversation_id`) REFERENCES `conversations`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`sender_id`) REFERENCES `members`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `messages_conversation_date` ON `direct_messages` (`conversation_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `payment_orders` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`course_id` text NOT NULL,
	`amount` integer NOT NULL,
	`currency` text DEFAULT 'VND' NOT NULL,
	`provider` text DEFAULT 'VNPAY_SANDBOX' NOT NULL,
	`status` text DEFAULT 'PENDING' NOT NULL,
	`provider_transaction` text,
	`response_code` text,
	`version` integer DEFAULT 1 NOT NULL,
	`created_at` text NOT NULL,
	`expires_at` text NOT NULL,
	`paid_at` text,
	FOREIGN KEY (`user_id`) REFERENCES `members`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`course_id`) REFERENCES `courses`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `orders_user` ON `payment_orders` (`user_id`,`created_at`);--> statement-breakpoint
CREATE UNIQUE INDEX `order_provider_transaction` ON `payment_orders` (`provider_transaction`);--> statement-breakpoint
CREATE TABLE `auth_recovery_codes` (
	`user_id` text NOT NULL,
	`code_hash` text NOT NULL,
	`used_at` text,
	PRIMARY KEY(`user_id`, `code_hash`),
	FOREIGN KEY (`user_id`) REFERENCES `auth_accounts`(`user_id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
ALTER TABLE `backups` ADD `schema_version` integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE `courses` ADD `price_vnd` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `members` ADD `dm_enabled` integer DEFAULT 1 NOT NULL;