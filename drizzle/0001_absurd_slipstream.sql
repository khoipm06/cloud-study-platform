CREATE TABLE `categories` (
	`name` text PRIMARY KEY NOT NULL,
	`normalized` text NOT NULL,
	`active` integer DEFAULT 1 NOT NULL,
	`version` integer DEFAULT 1 NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `categories_normalized_unique` ON `categories` (`normalized`);--> statement-breakpoint
CREATE TABLE `question_bank` (
	`course_id` text NOT NULL,
	`id` text NOT NULL,
	`data` text NOT NULL,
	`version` integer DEFAULT 1 NOT NULL,
	`archived` integer DEFAULT 0 NOT NULL,
	`updated_at` text NOT NULL,
	PRIMARY KEY(`course_id`, `id`),
	FOREIGN KEY (`course_id`) REFERENCES `courses`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `quiz_revisions` (
	`course_id` text NOT NULL,
	`revision` integer NOT NULL,
	`questions` text NOT NULL,
	`created_at` text NOT NULL,
	PRIMARY KEY(`course_id`, `revision`),
	FOREIGN KEY (`course_id`) REFERENCES `courses`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
ALTER TABLE `audit` ADD `reason` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `audit` ADD `request_id` text;--> statement-breakpoint
ALTER TABLE `courses` ADD `quiz_revision` integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE `enrollments` ADD `last_lesson_id` text REFERENCES lessons(id);--> statement-breakpoint
ALTER TABLE `enrollments` ADD `last_accessed_at` text;--> statement-breakpoint
ALTER TABLE `enrollments` ADD `completed_at` text;--> statement-breakpoint
ALTER TABLE `lessons` ADD `type` text DEFAULT 'TEXT' NOT NULL;--> statement-breakpoint
ALTER TABLE `lessons` ADD `video_url` text;--> statement-breakpoint
ALTER TABLE `lessons` ADD `required` integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE `materials` ADD `status` text DEFAULT 'READY' NOT NULL;--> statement-breakpoint
ALTER TABLE `materials` ADD `detached_at` text;--> statement-breakpoint
ALTER TABLE `materials` ADD `version` integer DEFAULT 1 NOT NULL;