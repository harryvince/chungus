CREATE TABLE `games` (
	`id` integer AUTOINCREMENT,
	`user_id` text NOT NULL,
	`name` text NOT NULL,
	`start_time` integer DEFAULT current_timestamp NOT NULL,
	`end_time` integer,
	`created_at` integer DEFAULT current_timestamp NOT NULL,
	CONSTRAINT `games_pk` PRIMARY KEY(`id`),
	CONSTRAINT `fk_games_user_id_users_id_fk` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`)
);
--> statement-breakpoint
CREATE TABLE `users` (
	`id` text,
	`name` text NOT NULL,
	`display_name` text,
	`avatar` text,
	`created_at` integer DEFAULT current_timestamp NOT NULL,
	CONSTRAINT `users_pk` PRIMARY KEY(`id`)
);
