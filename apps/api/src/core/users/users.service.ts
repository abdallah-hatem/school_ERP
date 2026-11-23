import { Injectable } from '@nestjs/common';
import type { AuthUser, PersonAvatarRef, RoleRef } from '@school-erp/shared';
import { normalizeEmail, verifyPassword } from '../../common/utils/password.util';
import { UsersRepository } from './repositories/users.repository';

/**
 * A real bcrypt hash of a random string. Compared against when the email is unknown, so an
 * unknown email costs the same time as a wrong password and the response gives nothing away.
 */
const DUMMY_HASH = '$2b$12$edctwMe9HrzXaup3Mmm8COox2N3fLKv5.RTRazEEqVm3MF5rKbD8q';

/**
 * core/users — the people who sign in. Accounts are created by a System admin (R9: no self
 * sign-up) through `UserAccountsService`; this service is what sign-in needs.
 */
@Injectable()
export class UsersService {
  constructor(private readonly users: UsersRepository) {}

  /** The user for a correct email + password, or null. Inactive users never sign in. */
  async verifyCredentials(email: string, password: string): Promise<AuthUser | null> {
    const found = await this.users.findCredentialsByEmail(normalizeEmail(email));
    const ok = await verifyPassword(password, found?.passwordHash ?? DUMMY_HASH);
    if (!found || !ok || !found.isActive) return null;
    return {
      id: found.id,
      email: found.email,
      name: found.name,
      mustChangePassword: found.mustChangePassword,
    };
  }

  /** The active user behind a token's subject, or null (deleted or deactivated since). */
  findActiveAuthUser(id: string): Promise<AuthUser | null> {
    return this.users.findActiveAuthUser(id);
  }

  /** The same, with the cut-off its access tokens are checked against (L-1). */
  findActiveSession(id: string): Promise<{ user: AuthUser; validAfter: Date | null } | null> {
    return this.users.findActiveSession(id);
  }

  /** Notes a successful sign-in (the Users screen's "Last sign-in", P3). */
  async recordSignIn(id: string, at: Date = new Date()): Promise<void> {
    await this.users.update(id, { lastSignInAt: at });
  }

  /** The linked employee's photo and gender (the user chip's avatar), or null: not linked. */
  avatarOf(id: string): Promise<PersonAvatarRef | null> {
    return this.users.avatarOf(id);
  }

  /**
   * The account whose employee record `employeeId` is (R9: at most one), or null — the "Signs in
   * as" line on HR's employee profile. Name and id only.
   */
  accountOfEmployee(employeeId: string): Promise<{ id: string; name: string } | null> {
    return this.users.accountOfEmployee(employeeId);
  }

  /** The roles a user holds, starting roles first (the user chip under the menu). */
  rolesOf(id: string): Promise<RoleRef[]> {
    return this.users.roleRefsOf(id);
  }
}
