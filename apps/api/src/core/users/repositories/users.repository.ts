import { Injectable } from '@nestjs/common';
import { Prisma, type User } from '@prisma/client';
import type { AuthUser } from '@school-erp/shared';
import { BaseRepository } from '../../../common/repositories/base.repository';
import { DatabaseService } from '../../../database/database.service';

/** What may leave the API about a user. Never the password hash. */
const AUTH_USER_SELECT = {
  id: true,
  email: true,
  name: true,
  role: true,
} satisfies Prisma.UserSelect;

/** For sign-in only: the safe fields plus what the check needs. */
const CREDENTIALS_SELECT = {
  ...AUTH_USER_SELECT,
  passwordHash: true,
  isActive: true,
} satisfies Prisma.UserSelect;

export type UserCredentials = Prisma.UserGetPayload<{ select: typeof CREDENTIALS_SELECT }>;

@Injectable()
export class UsersRepository extends BaseRepository<
  User,
  Prisma.UserCreateInput,
  Prisma.UserUpdateInput
> {
  constructor(databaseService: DatabaseService) {
    super(databaseService, 'user');
  }

  /** Case-insensitive, so `Admin@School.local` finds `admin@school.local`. */
  findCredentialsByEmail(email: string): Promise<UserCredentials | null> {
    return this.databaseService.user.findFirst({
      where: { email: { equals: email, mode: 'insensitive' } },
      select: CREDENTIALS_SELECT,
    });
  }

  findActiveAuthUser(id: string): Promise<AuthUser | null> {
    return this.databaseService.user.findFirst({
      where: { id, isActive: true },
      select: AUTH_USER_SELECT,
    });
  }

  async findName(id: string): Promise<string | null> {
    const row = await this.databaseService.user.findUnique({ where: { id }, select: { name: true } });
    return row?.name ?? null;
  }
}
