import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { CoreEvent, type UserSessionsEndedEvent } from '@school-erp/shared';
import { RefreshTokensRepository } from '../repositories/refresh-tokens.repository';

/**
 * R9 / edge case 6 — a deactivated user (or one given a temporary password) is signed out
 * everywhere: every refresh token they hold is revoked, so no refresh brings a session back —
 * not even after a later reactivation. Their access token is already refused, because every
 * request re-reads the user (`JwtStrategy`). Idempotent: revoking twice changes nothing.
 */
@Injectable()
export class SessionsEndedListener {
  private readonly logger = new Logger(SessionsEndedListener.name);

  constructor(private readonly refreshTokens: RefreshTokensRepository) {}

  @OnEvent(CoreEvent.USER_SESSIONS_ENDED)
  async revoke(event: UserSessionsEndedEvent): Promise<void> {
    try {
      await this.refreshTokens.revokeAllOf(event.userId, new Date(event.at));
    } catch (e) {
      this.logger.error(
        `Could not end the sessions of user ${event.userId}`,
        e instanceof Error ? e.stack : String(e),
      );
    }
  }
}
