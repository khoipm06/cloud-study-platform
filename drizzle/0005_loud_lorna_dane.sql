CREATE TABLE `backups` (
	`id` text PRIMARY KEY NOT NULL,
	`created_by` text NOT NULL,
	`status` text NOT NULL,
	`object_key` text,
	`manifest_hash` text,
	`file_count` integer DEFAULT 0 NOT NULL,
	`record_count` integer DEFAULT 0 NOT NULL,
	`message` text DEFAULT '' NOT NULL,
	`created_at` text NOT NULL,
	`completed_at` text
);
--> statement-breakpoint
CREATE TABLE `course_quizzes` (
	`id` text PRIMARY KEY NOT NULL,
	`course_id` text NOT NULL,
	`title` text NOT NULL,
	`status` text DEFAULT 'DRAFT' NOT NULL,
	`questions` text DEFAULT '[]' NOT NULL,
	`revision` integer DEFAULT 0 NOT NULL,
	`version` integer DEFAULT 1 NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`course_id`) REFERENCES `courses`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `course_quiz_course` ON `course_quizzes` (`course_id`);--> statement-breakpoint
CREATE TABLE `mentor_bookings` (
	`id` text PRIMARY KEY NOT NULL,
	`slot_id` text NOT NULL,
	`mentor_id` text NOT NULL,
	`student_id` text NOT NULL,
	`goal` text NOT NULL,
	`status` text DEFAULT 'REQUESTED' NOT NULL,
	`expires_at` text NOT NULL,
	`meeting_url` text,
	`reason` text DEFAULT '' NOT NULL,
	`version` integer DEFAULT 1 NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`slot_id`) REFERENCES `mentor_slots`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`mentor_id`) REFERENCES `members`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`student_id`) REFERENCES `members`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `one_reserved_mentor_slot` ON `mentor_bookings` (`slot_id`) WHERE status IN ('REQUESTED','CONFIRMED');--> statement-breakpoint
CREATE INDEX `booking_student` ON `mentor_bookings` (`student_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `booking_mentor` ON `mentor_bookings` (`mentor_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `mentor_feedback` (
	`booking_id` text PRIMARY KEY NOT NULL,
	`student_id` text NOT NULL,
	`mentor_id` text NOT NULL,
	`rating` integer NOT NULL,
	`comment` text NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`booking_id`) REFERENCES `mentor_bookings`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`student_id`) REFERENCES `members`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`mentor_id`) REFERENCES `members`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `mentor_profiles` (
	`user_id` text PRIMARY KEY NOT NULL,
	`headline` text NOT NULL,
	`expertise` text NOT NULL,
	`biography` text NOT NULL,
	`timezone` text NOT NULL,
	`active` integer DEFAULT 1 NOT NULL,
	`version` integer DEFAULT 1 NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `members`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `mentor_slots` (
	`id` text PRIMARY KEY NOT NULL,
	`mentor_id` text NOT NULL,
	`starts_at` text NOT NULL,
	`ends_at` text NOT NULL,
	`timezone` text NOT NULL,
	`status` text DEFAULT 'OPEN' NOT NULL,
	`version` integer DEFAULT 1 NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`mentor_id`) REFERENCES `members`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `mentor_slots_date` ON `mentor_slots` (`mentor_id`,`starts_at`);--> statement-breakpoint
CREATE TABLE `named_quiz_attempts` (
	`id` text PRIMARY KEY NOT NULL,
	`quiz_id` text NOT NULL,
	`course_id` text NOT NULL,
	`user_id` text NOT NULL,
	`revision` integer NOT NULL,
	`snapshot` text NOT NULL,
	`answers` text DEFAULT '{}' NOT NULL,
	`score` integer,
	`status` text DEFAULT 'IN_PROGRESS' NOT NULL,
	`version` integer DEFAULT 1 NOT NULL,
	`created_at` text NOT NULL,
	`expires_at` text NOT NULL,
	`submitted_at` text,
	FOREIGN KEY (`quiz_id`) REFERENCES `course_quizzes`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`course_id`) REFERENCES `courses`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`user_id`) REFERENCES `members`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `one_active_named_attempt` ON `named_quiz_attempts` (`user_id`,`quiz_id`) WHERE status = 'IN_PROGRESS';--> statement-breakpoint
CREATE INDEX `named_attempt_user` ON `named_quiz_attempts` (`user_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `named_quiz_revisions` (
	`quiz_id` text NOT NULL,
	`revision` integer NOT NULL,
	`questions` text NOT NULL,
	`created_at` text NOT NULL,
	PRIMARY KEY(`quiz_id`, `revision`),
	FOREIGN KEY (`quiz_id`) REFERENCES `course_quizzes`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `operation_leases` (
	`key` text PRIMARY KEY NOT NULL,
	`token` text NOT NULL,
	`expires_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `operation_runs` (
	`id` text PRIMARY KEY NOT NULL,
	`actor` text NOT NULL,
	`status` text NOT NULL,
	`summary` text NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `restore_previews` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`backup_id` text NOT NULL,
	`manifest_hash` text NOT NULL,
	`expires_at` text NOT NULL,
	`used` integer DEFAULT 0 NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `members`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`backup_id`) REFERENCES `backups`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
ALTER TABLE `members` ADD `bio` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `members` ADD `is_mentor` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `members` ADD `version` integer DEFAULT 1 NOT NULL;