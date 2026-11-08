CREATE TABLE `lab_exercises` (
	`id` text PRIMARY KEY NOT NULL,
	`course_id` text NOT NULL,
	`title` text NOT NULL,
	`instructions` text NOT NULL,
	`starter_code` text NOT NULL,
	`cases` text NOT NULL,
	`status` text DEFAULT 'DRAFT' NOT NULL,
	`version` integer DEFAULT 1 NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`course_id`) REFERENCES `courses`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `lab_course` ON `lab_exercises` (`course_id`);--> statement-breakpoint
CREATE TABLE `lab_runs` (
	`id` text PRIMARY KEY NOT NULL,
	`lab_id` text NOT NULL,
	`course_id` text NOT NULL,
	`user_id` text NOT NULL,
	`lab_version` integer NOT NULL,
	`snapshot` text NOT NULL,
	`source_code` text NOT NULL,
	`tokens` text DEFAULT '[]' NOT NULL,
	`results` text DEFAULT '[]' NOT NULL,
	`status` text DEFAULT 'SUBMITTING' NOT NULL,
	`message` text DEFAULT '' NOT NULL,
	`score` integer,
	`version` integer DEFAULT 1 NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	`expires_at` text NOT NULL,
	FOREIGN KEY (`lab_id`) REFERENCES `lab_exercises`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`course_id`) REFERENCES `courses`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`user_id`) REFERENCES `members`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `one_active_lab_run` ON `lab_runs` (`user_id`,`lab_id`) WHERE status IN ('SUBMITTING','RUNNING');--> statement-breakpoint
CREATE INDEX `lab_runs_user` ON `lab_runs` (`user_id`,`created_at`);