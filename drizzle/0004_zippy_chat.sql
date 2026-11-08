CREATE INDEX `comments_post_date` ON `discussion_comments` (`post_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `comments_user_rate` ON `discussion_comments` (`user_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `posts_course_date` ON `discussion_posts` (`course_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `posts_user_rate` ON `discussion_posts` (`user_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `reports_status_date` ON `discussion_reports` (`status`,`created_at`);--> statement-breakpoint
CREATE INDEX `goals_user_status` ON `learning_goals` (`user_id`,`status`);--> statement-breakpoint
CREATE INDEX `notifications_user_date` ON `learning_notifications` (`user_id`,`invalidated`,`created_at`);--> statement-breakpoint
CREATE INDEX `sessions_user_start` ON `study_sessions` (`user_id`,`starts_at`);--> statement-breakpoint
CREATE INDEX `sessions_due` ON `study_sessions` (`user_id`,`status`,`reminder_at`);