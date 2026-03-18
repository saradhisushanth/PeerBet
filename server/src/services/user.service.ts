import { prisma } from "../lib/prisma.js";

export const userService = {
  async getAll() {
    return prisma.user.findMany({
      select: { id: true, username: true },
      orderBy: { username: "asc" },
    });
  },
};
