CREATE TABLE `clips` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`clipKey` varchar(32) NOT NULL,
	`fileName` varchar(255) NOT NULL,
	`mimeType` varchar(100) NOT NULL,
	`sizeBytes` int NOT NULL DEFAULT 0,
	`durationMs` int NOT NULL DEFAULT 0,
	`storageKey` text,
	`mediaUrl` text,
	`thumbnailKey` text,
	`thumbnailUrl` text,
	`clipStatus` enum('uploading','analyzing','ready','failed') NOT NULL DEFAULT 'uploading',
	`description` text NOT NULL,
	`subjects` text NOT NULL,
	`setting` varchar(255) NOT NULL,
	`timeOfDay` varchar(80) NOT NULL,
	`lighting` text NOT NULL,
	`colors` text NOT NULL,
	`moods` text NOT NULL,
	`shotType` varchar(80) NOT NULL,
	`cameraMotion` varchar(120) NOT NULL,
	`possibleUses` text NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `clips_id` PRIMARY KEY(`id`),
	CONSTRAINT `clips_clipKey_unique` UNIQUE(`clipKey`)
);
--> statement-breakpoint
CREATE TABLE `collectionClips` (
	`collectionId` int NOT NULL,
	`clipId` int NOT NULL,
	`addedAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `collectionClips_collectionId_clipId_pk` PRIMARY KEY(`collectionId`,`clipId`)
);
--> statement-breakpoint
CREATE TABLE `collections` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`name` varchar(120) NOT NULL,
	`description` text,
	`accent` varchar(30) NOT NULL DEFAULT 'violet',
	`isAiSuggested` boolean NOT NULL DEFAULT false,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `collections_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
ALTER TABLE `clips` ADD CONSTRAINT `clips_userId_users_id_fk` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `collectionClips` ADD CONSTRAINT `collectionClips_collectionId_collections_id_fk` FOREIGN KEY (`collectionId`) REFERENCES `collections`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `collectionClips` ADD CONSTRAINT `collectionClips_clipId_clips_id_fk` FOREIGN KEY (`clipId`) REFERENCES `clips`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `collections` ADD CONSTRAINT `collections_userId_users_id_fk` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `clips_user_created_idx` ON `clips` (`userId`,`createdAt`);--> statement-breakpoint
CREATE INDEX `clips_user_status_idx` ON `clips` (`userId`,`clipStatus`);--> statement-breakpoint
CREATE INDEX `collection_clips_clip_idx` ON `collectionClips` (`clipId`);--> statement-breakpoint
CREATE INDEX `collections_user_created_idx` ON `collections` (`userId`,`createdAt`);