import { Controller, Get } from '@nestjs/common';
import { SkipThrottle } from '@nestjs/throttler';
import { Public } from '../common/decorators/public.decorator';

@Controller('health')
export class HealthController {
  /** Uptime monitors poll it from a few IPs: never rate limited. */
  @Public()
  @SkipThrottle({ global: true })
  @Get()
  check(): { status: 'ok' } {
    return { status: 'ok' };
  }
}
