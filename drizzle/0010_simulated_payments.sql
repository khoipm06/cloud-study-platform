PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_payment_orders` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`course_id` text NOT NULL,
	`amount` integer NOT NULL,
	`currency` text DEFAULT 'VND' NOT NULL,
	`provider` text DEFAULT 'SIMULATED' NOT NULL,
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
INSERT INTO `__new_payment_orders`("id", "user_id", "course_id", "amount", "currency", "provider", "status", "provider_transaction", "response_code", "version", "created_at", "expires_at", "paid_at") SELECT "id", "user_id", "course_id", "amount", "currency", "provider", "status", "provider_transaction", "response_code", "version", "created_at", "expires_at", "paid_at" FROM `payment_orders`;--> statement-breakpoint
DROP TABLE `payment_orders`;--> statement-breakpoint
ALTER TABLE `__new_payment_orders` RENAME TO `payment_orders`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE INDEX `orders_user` ON `payment_orders` (`user_id`,`created_at`);--> statement-breakpoint
CREATE UNIQUE INDEX `order_provider_transaction` ON `payment_orders` (`provider_transaction`);
--> statement-breakpoint
UPDATE payment_orders SET status='CANCELLED',response_code='LEGACY_PROVIDER_DISABLED',version=version+1
WHERE provider='VNPAY_SANDBOX' AND status='PENDING';
