CREATE TABLE `course_review_events` (
	`id` text PRIMARY KEY NOT NULL,
	`course_id` text NOT NULL,
	`course_title` text NOT NULL,
	`owner_id` text NOT NULL,
	`actor_id` text NOT NULL,
	`kind` text NOT NULL,
	`reason` text DEFAULT '' NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`owner_id`) REFERENCES `members`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`actor_id`) REFERENCES `members`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "review_event_kind" CHECK("course_review_events"."kind" IN ('SUBMITTED','APPROVED','REJECTED','WITHDRAWN','ARCHIVED'))
);
--> statement-breakpoint
CREATE INDEX `reviews_course_time` ON `course_review_events` (`course_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `reviews_owner_time` ON `course_review_events` (`owner_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `wallet_transactions` (
	`id` text PRIMARY KEY NOT NULL,
	`kind` text NOT NULL,
	`from_user_id` text,
	`to_user_id` text NOT NULL,
	`course_id` text,
	`amount_vnd` integer NOT NULL,
	`actor_id` text,
	`reason` text DEFAULT '' NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`from_user_id`) REFERENCES `members`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`to_user_id`) REFERENCES `members`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`course_id`) REFERENCES `courses`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`actor_id`) REFERENCES `members`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "wallet_positive_amount" CHECK(typeof("wallet_transactions"."amount_vnd") = 'integer' AND "wallet_transactions"."amount_vnd" BETWEEN 1 AND 100000000),
	CONSTRAINT "wallet_transaction_shape" CHECK(
    ("wallet_transactions"."kind" = 'WELCOME' AND "wallet_transactions"."from_user_id" IS NULL AND "wallet_transactions"."course_id" IS NULL AND "wallet_transactions"."actor_id" IS NULL)
    OR ("wallet_transactions"."kind" = 'GRANT' AND "wallet_transactions"."from_user_id" IS NULL AND "wallet_transactions"."course_id" IS NULL AND "wallet_transactions"."actor_id" IS NOT NULL)
    OR ("wallet_transactions"."kind" = 'PURCHASE' AND "wallet_transactions"."from_user_id" IS NOT NULL AND "wallet_transactions"."from_user_id" <> "wallet_transactions"."to_user_id"
      AND "wallet_transactions"."course_id" IS NOT NULL AND "wallet_transactions"."actor_id" IS NULL)
  )
);
--> statement-breakpoint
CREATE INDEX `wallet_recipient` ON `wallet_transactions` (`to_user_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `wallet_sender` ON `wallet_transactions` (`from_user_id`,`created_at`);--> statement-breakpoint
CREATE UNIQUE INDEX `wallet_welcome_once` ON `wallet_transactions` (`to_user_id`) WHERE "wallet_transactions"."kind" = 'WELCOME';--> statement-breakpoint
CREATE UNIQUE INDEX `wallet_course_purchase_once` ON `wallet_transactions` (`from_user_id`,`course_id`) WHERE "wallet_transactions"."kind" = 'PURCHASE';