CREATE TABLE `auth_email_verifications` (
	`user_id` text PRIMARY KEY NOT NULL,
	`email` text NOT NULL,
	`verified_at` text NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `auth_accounts`(`user_id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `email_tokens` (
	`token_hash` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`email` text NOT NULL,
	`purpose` text NOT NULL,
	`credential_version` integer NOT NULL,
	`expires_at` text NOT NULL,
	`created_at` text NOT NULL,
	`used_at` text,
	FOREIGN KEY (`user_id`) REFERENCES `auth_accounts`(`user_id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "email_token_purpose" CHECK("email_tokens"."purpose" IN ('VERIFY','RESET'))
);
--> statement-breakpoint
CREATE INDEX `email_tokens_user` ON `email_tokens` (`user_id`,`purpose`);--> statement-breakpoint
CREATE INDEX `email_tokens_expiry` ON `email_tokens` (`expires_at`);--> statement-breakpoint
CREATE TABLE `tutor_messages` (
	`id` text PRIMARY KEY NOT NULL,
	`thread_id` text NOT NULL,
	`request_id` text NOT NULL,
	`question` text NOT NULL,
	`answer` text NOT NULL,
	`citations` text NOT NULL,
	`mode` text DEFAULT 'EXTRACTIVE_SEARCH' NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`thread_id`) REFERENCES `tutor_threads`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `tutor_message_request` ON `tutor_messages` (`thread_id`,`request_id`);--> statement-breakpoint
CREATE TABLE `tutor_threads` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`course_id` text NOT NULL,
	`title` text NOT NULL,
	`version` integer DEFAULT 1 NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `members`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`course_id`) REFERENCES `courses`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `tutor_threads_user_course` ON `tutor_threads` (`user_id`,`course_id`,`updated_at`);