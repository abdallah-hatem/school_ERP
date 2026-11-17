import { Injectable } from '@nestjs/common';
import type { AuthUser } from '@school-erp/shared';
import { normalizeEmail, verifyPassword } from '../../common/utils/password.util';
import { UsersRepository } from './repositories/users.repository';

/**
 * A real bcrypt hash of a random string. Compared against when the email is unknown, so an
 * unknown email costs the same time as a wrong password and the response gives nothing away.
 */
const DUMMY_HASH = '$2b$12$edctwMe9HrzXaup3Mmm8COox2N3fLKv5.RTRazEEqVm3MF5rKbD8q';

/** core/users — the people who sign in. Accounts come from the seed (§2: no self sign-up). */
@Injectable()
export class UsersService {
  constructor(private readonly users: UsersRepository) {}

  /** The user for a correct email + password, or null. Inactive users never sign in. */
  async verifyCredentials(email: string, password: string): Promise<AuthUser | null> {
    const found = await this.users.findCredentialsByEmail(normalizeEmail(email));
    const ok = await verifyPassword(password, found?.passwordHash ?? DUMMY_HASH);
    if (!found || !ok || !found.isActive) return null;
    return { id: found.id, email: found.email, name: found.name, role: found.role };
  }

  /** The active user behind a token's subject, or null (deleted or deactivated since). */
  findActiveAuthUser(id: string): Promise<AuthUser | null> {
    return this.users.findActiveAuthUser(id);
  }

  /** A user's current name (any status), or null when there is no such user. */
  findName(id: string): Promise<string | null> {
    return this.users.findName(id);
  }
}
