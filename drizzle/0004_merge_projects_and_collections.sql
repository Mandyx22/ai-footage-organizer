CREATE TABLE `projectClips` (
	`projectId` int NOT NULL,
	`clipId` int NOT NULL,
	`addedAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `projectClips_projectId_clipId_pk` PRIMARY KEY(`projectId`,`clipId`)
);
--> statement-breakpoint
ALTER TABLE `editingProjects` ADD `isAiSuggested` boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `projectClips` ADD CONSTRAINT `projectClips_projectId_editingProjects_id_fk` FOREIGN KEY (`projectId`) REFERENCES `editingProjects`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `projectClips` ADD CONSTRAINT `projectClips_clipId_clips_id_fk` FOREIGN KEY (`clipId`) REFERENCES `clips`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `project_clips_clip_idx` ON `projectClips` (`clipId`);
--> statement-breakpoint
INSERT INTO `editingProjects` (`userId`, `name`, `description`, `accent`, `isAiSuggested`, `createdAt`, `updatedAt`)
SELECT c.`userId`, c.`name`, c.`description`, c.`accent`, 1, c.`createdAt`, c.`updatedAt`
FROM `collections` c;
--> statement-breakpoint
INSERT INTO `projectClips` (`projectId`, `clipId`, `addedAt`)
SELECT m.`projectId`, m.`clipId`, m.`addedAt` FROM (
	SELECT ep.`id` AS `projectId`, pcc.`clipId`, pcc.`addedAt`
	FROM `collectionClips` pcc
	JOIN `collections` c ON c.`id` = pcc.`collectionId`
	JOIN `editingProjects` ep ON ep.`userId` = c.`userId` AND ep.`name` = c.`name` AND ep.`description` <=> c.`description` AND ep.`isAiSuggested` = 1
	UNION ALL
	SELECT cl.`projectId`, cl.`id`, cl.`createdAt`
	FROM `clips` cl
	WHERE cl.`projectId` IS NOT NULL
) m
ON DUPLICATE KEY UPDATE `projectClips`.`addedAt` = m.`addedAt`;
--> statement-breakpoint
ALTER TABLE `clips` DROP FOREIGN KEY `clips_projectId_editingProjects_id_fk`;
--> statement-breakpoint
DROP INDEX `clips_project_created_idx` ON `clips`;--> statement-breakpoint
ALTER TABLE `clips` DROP COLUMN `projectId`;
--> statement-breakpoint
DROP TABLE `collectionClips`;--> statement-breakpoint
DROP TABLE `collections`;