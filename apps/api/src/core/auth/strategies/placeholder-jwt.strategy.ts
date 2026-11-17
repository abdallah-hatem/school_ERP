import { Injectable } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { Strategy } from 'passport-strategy';

/** A passport strategy that rejects every request. */
class RejectAllStrategy extends Strategy {
  name = 'jwt';

  authenticate(): void {
    this.fail(401);
  }
}

/**
 * PLACEHOLDER until T2: registers the 'jwt' strategy the global JwtAuthGuard uses, and rejects
 * every non-public request with 401. T2 replaces this with the real passport-jwt cookie strategy.
 */
@Injectable()
export class PlaceholderJwtStrategy extends PassportStrategy(RejectAllStrategy, 'jwt') {
  validate(): never {
    throw new Error('PlaceholderJwtStrategy never authenticates');
  }
}
