import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

export type UserSummary = {
  userId: number;
  userName: string | null;
  email: string | null;
  firstName: string | null;
  lastName: string | null;
  role: string | null;
  isAdmin: boolean;
  locked: boolean;
};

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  /** Identity lookup — never exposes password hashes or credentials. */
  async search(params?: { q?: string; page?: number; limit?: number }) {
    const page = Math.max(params?.page ?? 1, 1);
    const limit = Math.min(Math.max(params?.limit ?? 20, 1), 100);
    const term = params?.q?.trim();

    const where: Prisma.UsersWhereInput = term
      ? {
          OR: [
            { USER_NAME: { contains: term, mode: 'insensitive' } },
            { EMAIL_ADDRESS: { contains: term, mode: 'insensitive' } },
            { FIRST_NAME: { contains: term, mode: 'insensitive' } },
            { LAST_NAME: { contains: term, mode: 'insensitive' } },
          ],
        }
      : {};

    const [rows, total] = await Promise.all([
      this.prisma.users.findMany({
        where,
        orderBy: { USER_ID: 'asc' },
        skip: (page - 1) * limit,
        take: limit,
        include: { role: { select: { ROLE_NAME: true } } },
      }),
      this.prisma.users.count({ where }),
    ]);

    const items: UserSummary[] = rows.map((u) => ({
      userId: u.USER_ID,
      userName: u.USER_NAME,
      email: u.EMAIL_ADDRESS,
      firstName: u.FIRST_NAME,
      lastName: u.LAST_NAME,
      role: u.role?.ROLE_NAME ?? null,
      isAdmin: u.IS_ADMIN?.toUpperCase() === 'Y',
      locked: u.LOCK_ACCOUNT?.toUpperCase() === 'Y',
    }));

    return { items, meta: { page, limit, total } };
  }
}
