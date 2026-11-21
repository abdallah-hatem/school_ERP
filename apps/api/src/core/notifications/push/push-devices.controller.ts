import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  Req,
} from '@nestjs/common';
import type { AuthUser, PushDevices } from '@school-erp/shared';
import type { Request } from 'express';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import { Audited } from '../../audit';
import { SignedIn } from '../../permissions';
import { AddPushDeviceDto, RemovePushDeviceDto } from '../dto/push-devices.dto';
import { PushDevicesService } from './push-devices.service';

/**
 * My account → Notifications → "Alerts on this device" and My devices (§11 → Push). Every route is
 * the signed-in person's own devices; another person's device is a 404.
 */
@Controller('notifications/push-devices')
export class PushDevicesController {
  constructor(private readonly devices: PushDevicesService) {}

  /** Whether this server sends alerts, the key a browser subscribes with, and my devices. */
  @Get()
  @SignedIn()
  list(@CurrentUser() me: AuthUser): Promise<PushDevices> {
    return this.devices.list(me);
  }

  @Post()
  @SignedIn()
  @Audited('core.push_device.add')
  add(
    @CurrentUser() me: AuthUser,
    @Body() dto: AddPushDeviceDto,
    @Req() req: Request,
  ): Promise<PushDevices> {
    return this.devices.add(me, {
      endpoint: dto.endpoint,
      keys: dto.keys,
      locale: dto.locale,
      userAgent: dto.userAgent ?? req.headers['user-agent'] ?? null,
    });
  }

  @Post('unsubscribe')
  @SignedIn()
  @Audited('core.push_device.remove')
  @HttpCode(HttpStatus.OK)
  unsubscribe(@CurrentUser() me: AuthUser, @Body() dto: RemovePushDeviceDto): Promise<PushDevices> {
    return this.devices.removeByEndpoint(me, dto.endpoint);
  }

  @Delete(':id')
  @SignedIn()
  @Audited('core.push_device.remove')
  remove(
    @CurrentUser() me: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<PushDevices> {
    return this.devices.remove(me, id);
  }
}
