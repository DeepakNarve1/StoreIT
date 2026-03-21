/*
  Warnings:

  - You are about to drop the column `userId` on the `password_reset_tokens` table. All the data in the column will be lost.

*/
-- DropForeignKey
ALTER TABLE "password_reset_tokens" DROP CONSTRAINT "password_reset_tokens_userId_fkey";

-- AlterTable
ALTER TABLE "password_reset_tokens" DROP COLUMN "userId";
