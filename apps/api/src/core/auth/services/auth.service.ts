import { HttpStatus, Injectable } from '@nestjs/common';
import { Propagation, TransactionHost } from '@nestjs-cls/transactional';
import {
  AUDIT_FAILED_SIGN_IN,
  AuditEntityType,
  ErrorCode,
  type AuthUser,
} from '@school-erp/shared';
import { CodedException } from '../../../common/errors/coded.exception';
import { normalizeEmail } from '../../../common/utils/password.util';
import type { DbAdapter } from '../../../database/transactions';
import { AuditService } from '../../audit';
import { UsersService } from '../../users';
import { IssuedSession } from '../session';
import { TokensService } from './tokens.service';

/**
 * Sign-in, refresh and sign-out. Cookies are written by AuthCookiesInterceptor. Sign-in, sign-out
 * and failed sign-ins are recorded in the audit log (D11); a refresh is not.
 */
@Injectable()
export class AuthService {
  constructor(
    private readonly users: UsersService,
    private readonly tokens: TokensService,
    private readonly audit: AuditService,
    private readonly txHost: TransactionHost<DbAdapter>,
  ) {}

  /** Wrong password, unknown email and inactive user all get the same 401 (no hint). */
  async login(email: string, password: string): Promise<IssuedSession> {
    const user = await this.users.verifyCredentials(email, password);
    if (!user) {
      await this.recordFailedSignIn(email);
      throw new CodedException(HttpStatus.UNAUTHORIZED, ErrorCode.INVALID_CREDENTIALS);
    }
    await this.users.recordSignIn(user.id);
    const session = await this.issue(user, await this.tokens.issueRefresh(user.id));
    // The request has no signed-in user yet: the actor is the one signing in.
    await this.audit.record({
      action: 'core.auth.sign_in',
      entity: this.entity(user),
      actor: { id: user.id, name: user.name },
    });
    return session;
  }

  async refresh(rawRefreshToken: string | undefined): Promise<IssuedSession> {
    const rotated = await this.tokens.rotate(rawRefreshToken);
    if (!rotated.ok) {
      throw new CodedException(HttpStatus.UNAUTHORIZED, ErrorCode.INVALID_REFRESH_TOKEN);
    }
    const user = await this.users.findActiveAuthUser(rotated.userId);
    if (!user) {
      await this.tokens.revokeFamily(rotated.familyId);
      throw new CodedException(HttpStatus.UNAUTHORIZED, ErrorCode.INVALID_REFRESH_TOKEN);
    }
    return this.issue(user, rotated.refreshToken);
  }

  async logout(user: AuthUser, rawRefreshToken: string | undefined): Promise<void> {
    await this.tokens.revoke(rawRefreshToken, user.id);
    await this.audit.record({ action: 'core.auth.sign_out', entity: this.entity(user) });
  }

  /**
   * A failed sign-in (spec 5): the email as typed (normalised), no actor, never the password. The
   * same entry whether the email is a user's or not — the record is the typed email, not an
   * account — so neither the answer nor the log tells the two apart. Written in its own
   * transaction, since the request's rolls back with the 401.
   */
  private recordFailedSignIn(email: string): Promise<void> {
    const typed = normalizeEmail(email);
    return this.txHost.withTransaction(Propagation.RequiresNew, () =>
      this.audit.record({
        action: AUDIT_FAILED_SIGN_IN,
        entity: { type: AuditEntityType.USER, id: typed, label: typed },
        actor: null,
      }),
    );
  }

  private entity(user: Pick<AuthUser, 'id' | 'name'>) {
    return { type: AuditEntityType.USER, id: user.id, label: user.name };
  }

  private async issue(user: AuthUser, refreshToken: string): Promise<IssuedSession> {
    return new IssuedSession(user, {
      accessToken: await this.tokens.signAccess(user),
      refreshToken,
    });
  }
}
