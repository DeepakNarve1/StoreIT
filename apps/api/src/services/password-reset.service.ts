import { v4 as uuid } from "uuid";
import { prisma } from "../utils/prisma";

export async function createPasswordResetToken(email: string) {
  await prisma.passwordResetToken.updateMany({
    where: { email, isUsed: false },
    data: { isUsed: true },
  });

  const expiresAt = new Date(Date.now() + 60 * 60 * 1000);

  return prisma.passwordResetToken.create({
    data: {
      token: uuid(),
      email,
      expiresAt,
    },
  });
}
