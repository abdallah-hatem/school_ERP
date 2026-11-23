import { Injectable } from '@nestjs/common';

/** Ends a user's sign-ins except `keepFamilyId`, inside the caller's transaction. */
export type SessionRevoker = (userId: string, at: Date, keepFamilyId?: string) => Promise<unknown>;

/**
 * The way core/users ends sessions **inside its own transaction** (security review L2: a password
 * change and the end of the other sign-ins commit together, not one after the other). The refresh
 * tokens are core/auth's, and core/auth depends on core/users, so core/auth registers how
 * (`AuthSessionRevoker`, on start) instead of core/users reaching into its tables. The
 * `core.user.sessions_ended` event is still published, for logging and other listeners.
 */
@Injectable()
export class SessionRevocation {
  private revoker: SessionRevoker | null = null;

  register(revoker: SessionRevoker): void {
    this.revoker = revoker;
  }

  async endOtherSessions(userId: string, at: Date, keepFamilyId?: string): Promise<void> {
    // Never silently skipped: a password change that can't end the other sessions fails (rolls back).
    if (!this.revoker) throw new Error('SessionRevocation: no revoker registered (core/auth not loaded)');
    await this.revoker(userId, at, keepFamilyId);
  }
}
