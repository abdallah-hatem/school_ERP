import { Injectable } from '@nestjs/common';
import { TransactionHost } from '@nestjs-cls/transactional';
import { Prisma } from '@prisma/client';
import { PAGINATION, type AuthUser, type Gender, type Paginated } from '@school-erp/shared';
import type { DbAdapter } from '../../../database/transactions';

/** What may leave the API about a user. Never the password hash. */
const AUTH_USER_SELECT = {
  id: true,
  email: true,
  name: true,
  mustChangePassword: true,
} satisfies Prisma.UserSelect;

/** For sign-in only: the safe fields plus what the check needs. */
const CREDENTIALS_SELECT = {
  ...AUTH_USER_SELECT,
  passwordHash: true,
  isActive: true,
} satisfies Prisma.UserSelect;

/** A user account for the Users screen (roles are added by the service). Never the hash. */
const ACCOUNT_SELECT = {
  id: true,
  name: true,
  email: true,
  isActive: true,
  mustChangePassword: true,
  createdAt: true,
  lastSignInAt: true,
  passwordChangedAt: true,
  linkedEmployee: { select: { id: true, code: true, nameEn: true, nameAr: true, photoUrl: true, gender: true } },
  roles: {
    select: { role: { select: { id: true, key: true, nameEn: true, nameAr: true } } },
    orderBy: [{ role: { builtIn: 'desc' } }, { role: { sortOrder: 'asc' } }],
  },
} satisfies Prisma.UserSelect;

export type UserCredentials = Prisma.UserGetPayload<{ select: typeof CREDENTIALS_SELECT }>;
export type UserAccountRow = Prisma.UserGetPayload<{ select: typeof ACCOUNT_SELECT }>;

export interface UserFilter {
  search?: string;
  isActive?: boolean;
  /** Only the users holding this role. */
  roleId?: string;
}

/**
 * `users` (core/users owns it). Every call goes through the caller's open transaction
 * (`txHost.tx`, the plain client outside one), so a change and its audit entry commit together.
 */
@Injectable()
export class UsersRepository {
  constructor(private readonly txHost: TransactionHost<DbAdapter>) {}

  private get db() {
    return this.txHost.tx;
  }

  /** Case-insensitive, so `Admin@School.local` finds `admin@school.local`. */
  findCredentialsByEmail(email: string): Promise<UserCredentials | null> {
    return this.db.user.findFirst({
      where: { email: { equals: email, mode: 'insensitive' } },
      select: CREDENTIALS_SELECT,
    });
  }

  findActiveAuthUser(id: string): Promise<AuthUser | null> {
    return this.db.user.findFirst({ where: { id, isActive: true }, select: AUTH_USER_SELECT });
  }

  async findPasswordHash(id: string): Promise<string | null> {
    const row = await this.db.user.findUnique({ where: { id }, select: { passwordHash: true } });
    return row?.passwordHash ?? null;
  }

  async findAccountPage(
    filter: UserFilter,
    p: number,
    limit: number,
  ): Promise<Paginated<UserAccountRow>> {
    const take = Math.min(Math.max(1, limit), PAGINATION.maxLimit);
    const page = Math.max(1, p);
    const where: Prisma.UserWhereInput = {
      ...(filter.isActive === undefined ? {} : { isActive: filter.isActive }),
      ...(filter.roleId ? { roles: { some: { roleId: filter.roleId } } } : {}),
      ...(filter.search
        ? {
            OR: [
              { name: { contains: filter.search, mode: 'insensitive' } },
              { email: { contains: filter.search, mode: 'insensitive' } },
            ],
          }
        : {}),
    };
    const [data, total] = await Promise.all([
      this.db.user.findMany({
        where,
        select: ACCOUNT_SELECT,
        orderBy: [{ name: 'asc' }, { email: 'asc' }],
        skip: (page - 1) * take,
        take,
      }),
      this.db.user.count({ where }),
    ]);
    return {
      data,
      total,
      page,
      limit: take,
      hasNextPage: page * take < total,
      hasPreviousPage: page > 1,
    };
  }

  findAccount(id: string): Promise<UserAccountRow | null> {
    return this.db.user.findUnique({ where: { id }, select: ACCOUNT_SELECT });
  }

  /** Another user with this email (case-insensitive), or null. */
  async findIdByEmail(email: string): Promise<string | null> {
    const row = await this.db.user.findFirst({
      where: { email: { equals: email, mode: 'insensitive' } },
      select: { id: true },
    });
    return row?.id ?? null;
  }

  /** The user linked to this employee, if any. */
  async findIdByEmployee(employeeId: string): Promise<string | null> {
    const row = await this.db.user.findUnique({ where: { employeeId }, select: { id: true } });
    return row?.id ?? null;
  }

  /** Whether the employee exists (reads HR's table — reading is allowed, writing is not). */
  async employeeExists(employeeId: string): Promise<boolean> {
    return (await this.db.employee.count({ where: { id: employeeId } })) > 0;
  }

  async create(data: {
    name: string;
    email: string;
    passwordHash: string;
    employeeId: string | null;
  }): Promise<string> {
    const row = await this.db.user.create({
      data: { ...data, mustChangePassword: true, passwordChangedAt: new Date() },
      select: { id: true },
    });
    return row.id;
  }

  async update(
    id: string,
    data: Pick<
      Prisma.UserUncheckedUpdateInput,
      | 'name'
      | 'email'
      | 'employeeId'
      | 'isActive'
      | 'passwordHash'
      | 'mustChangePassword'
      | 'passwordChangedAt'
      | 'lastSignInAt'
    >,
  ): Promise<void> {
    await this.db.user.update({ where: { id }, data, select: { id: true } });
  }

  /**
   * The photo and gender of the employee linked to a user (the user chip's avatar, `GET /auth/me`),
   * or null when none is linked. Reads HR's table — reading is allowed, writing is not.
   */
  async avatarOf(userId: string): Promise<{ photoUrl: string | null; gender: Gender } | null> {
    const row = await this.db.user.findUnique({
      where: { id: userId },
      select: { linkedEmployee: { select: { photoUrl: true, gender: true } } },
    });
    return row?.linkedEmployee ?? null;
  }

  /** The roles a user holds, starting roles first (the user chip, `GET /auth/me`). */
  async roleRefsOf(userId: string): Promise<RoleRefRow[]> {
    const rows = await this.db.userRoleAssignment.findMany({
      where: { userId },
      select: ROLE_REF_SELECT,
      orderBy: [{ role: { builtIn: 'desc' } }, { role: { sortOrder: 'asc' } }],
    });
    return rows.map((r) => r.role);
  }

  /**
   * One page of employees for the linked-employee picker, each with the account already linked to
   * it. Reads HR's table (reading is allowed, writing is not). Search: either name or the code.
   */
  async findEmployeeOptionPage(
    search: string | undefined,
    p: number,
    limit: number,
  ): Promise<Paginated<EmployeeOptionRow>> {
    const take = Math.min(Math.max(1, limit), PAGINATION.maxLimit);
    const page = Math.max(1, p);
    const where: Prisma.EmployeeWhereInput = search
      ? {
          OR: [
            { nameEn: { contains: search, mode: 'insensitive' } },
            { nameAr: { contains: search, mode: 'insensitive' } },
            { code: { contains: search, mode: 'insensitive' } },
          ],
        }
      : {};
    const [data, total] = await Promise.all([
      this.db.employee.findMany({
        where,
        select: EMPLOYEE_OPTION_SELECT,
        orderBy: [{ status: 'asc' }, { nameEn: 'asc' }, { code: 'asc' }],
        skip: (page - 1) * take,
        take,
      }),
      this.db.employee.count({ where }),
    ]);
    return {
      data,
      total,
      page,
      limit: take,
      hasNextPage: page * take < total,
      hasPreviousPage: page > 1,
    };
  }
}

const ROLE_REF_SELECT = {
  role: { select: { id: true, key: true, nameEn: true, nameAr: true } },
} satisfies Prisma.UserRoleAssignmentSelect;
type RoleRefRow = Prisma.UserRoleAssignmentGetPayload<{ select: typeof ROLE_REF_SELECT }>['role'];

const EMPLOYEE_OPTION_SELECT = {
  id: true,
  code: true,
  nameEn: true,
  nameAr: true,
  status: true,
  photoUrl: true,
  gender: true,
  jobTitle: { select: { nameEn: true, nameAr: true } },
  linkedUser: { select: { id: true, name: true } },
} satisfies Prisma.EmployeeSelect;
export type EmployeeOptionRow = Prisma.EmployeeGetPayload<{ select: typeof EMPLOYEE_OPTION_SELECT }>;
