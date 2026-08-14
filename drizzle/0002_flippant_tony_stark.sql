CREATE TABLE `editingProjects` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`name` varchar(120) NOT NULL,
	`description` text,
	`accent` varchar(30) NOT NULL DEFAULT 'peach',
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `editingProjects_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
ALTER TABLE `clips` ADD `projectId` int;--> statement-breakpoint
ALTER TABLE `editingProjects` ADD CONSTRAINT `editingProjects_userId_users_id_fk` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `editing_projects_user_created_idx` ON `editingProjects` (`userId`,`createdAt`);--> statement-breakpoint
ALTER TABLE `clips` ADD CONSTRAINT `clips_projectId_editingProjects_id_fk` FOREIGN KEY (`projectId`) REFERENCES `editingProjects`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `clips_project_created_idx` ON `clips` (`projectId`,`createdAt`);