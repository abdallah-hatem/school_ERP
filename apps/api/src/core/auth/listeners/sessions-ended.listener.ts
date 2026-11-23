import { Injectable, type OnModuleInit } from '@nestjs/common';
import { CoreEvent, type UserSessionsEndedEvent } from '@school-erp/shared';
import { OnDomainEvent, type DomainEventListener } from '../../events';
import { SessionRevocation } from '../../users';
import { RefreshTokensRepository } from '../repositories/refresh-tokens.repository';

/**
 * R9 / edge case 6 — a deactivated user (or one given a temporary password, or who changed their
 * password — then every sign-in but the one that changed it, security review M3) is signed out
 * everywhere: every refresh token they hold is revoked, so no refresh brings a session back —
 * not even after a later reactivation. Their access token is already refused, because every
 * request re-reads the user (`JwtStrategy`). Idempotent: revoking twice changes nothing.
 * Fire-and-forget: a failure is logged by `DomainEvents` (a deactivated user stays locked out).
 *
 * It also gives core/users the way to end sessions inside its own transaction
 * (`SessionRevocation`, security review L2): a password change revokes the other sign-ins together
 * with the new password, and this listener's revoke afterwards then finds nothing left to do.
 */
@OnDomainEvent(CoreEvent.USER_SESSIONS_ENDED)
@Injectable()
export class SessionsEndedListener
  implements DomainEventListener<typeof CoreEvent.USER_SESSIONS_ENDED>, OnModuleInit
{
  constructor(
    private readonly refreshTokens: RefreshTokensRepository,
    private readonly revocation: SessionRevocation,
  ) {}

  onModuleInit(): void {
    this.revocation.register((userId, at, keepFamilyId) =>
      this.refreshTokens.revokeAllOf(userId, at, keepFamilyId),
    );
  }

  async handle(event: UserSessionsEndedEvent): Promise<void> {
    // A password change keeps the sign-in that made it (`keepFamilyId`) and ends the others (M3).
    await this.refreshTokens.revokeAllOf(event.userId, new Date(event.at), event.keepFamilyId);
  }
}
