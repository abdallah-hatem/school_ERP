import { HttpStatus, Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  AuditEntityType,
  ErrorCode,
  PUSH_DEVICES_MAX,
  type AuthUser,
  type Language,
  type PushDevice,
  type PushDevices,
} from '@school-erp/shared';
import { CodedException } from '../../../common/errors/coded.exception';
import type { AppConfig } from '../../../config';
import { AuditService } from '../../audit';
import { NotificationChannels } from '../channels';
import {
  PushDevicesRepository,
  type StoredPushDevice,
} from '../repositories/push-devices.repository';
import { deviceFrom, deviceLabel, endpointHash } from './push.pure';

export interface AddDeviceInput {
  endpoint: string;
  keys: { p256dh: string; auth: string };
  locale: Language;
  userAgent: string | null;
}

const view = (d: StoredPushDevice): PushDevice => ({
  id: d.id,
  browser: d.browser,
  os: d.os,
  createdAt: d.createdAt.toISOString(),
  lastUsedAt: d.lastUsedAt?.toISOString() ?? null,
  endpointHash: d.endpointHash,
});

/**
 * "Alerts on this device" (§11 → Push, owner 2026-11-21): the devices that get a person's
 * notifications as Web Push alerts. A person sees and changes only their own devices.
 *
 * Adding and removing a device are audited (`core.push_device.add` / `.remove`): unlike read state,
 * a device decides where the school's notifications — employees' names, approvals waiting — are
 * shown, like the per-type preferences (which are audited too). Turning alerts on again on a device
 * that already gets them (the same browser, a new language) changes no access and writes no entry.
 */
@Injectable()
export class PushDevicesService {
  private readonly publicKey: string | null;
  private readonly httpAllowed: boolean;

  constructor(
    config: ConfigService,
    private readonly devices: PushDevicesRepository,
    private readonly channels: NotificationChannels,
    private readonly audit: AuditService,
  ) {
    this.publicKey = config.get<AppConfig['push']>('push')?.publicKey ?? null;
    this.httpAllowed = config.get<AppConfig['nodeEnv']>('nodeEnv') !== 'production';
  }

  async list(user: Pick<AuthUser, 'id'>): Promise<PushDevices> {
    const available = this.channels.isAvailable('push');
    return {
      available,
      publicKey: available ? this.publicKey : null,
      devices: (await this.devices.activeOf(user.id)).map(view),
    };
  }

  /**
   * This browser gets the person's alerts from now on. The same endpoint again (the same browser)
   * refreshes its keys and language; one another account had (a shared computer) moves to this
   * person. Past `PUSH_DEVICES_MAX` devices, the one unused longest stops getting alerts.
   */
  async add(user: Pick<AuthUser, 'id'>, input: AddDeviceInput): Promise<PushDevices> {
    if (!this.channels.isAvailable('push')) {
      throw new CodedException(HttpStatus.CONFLICT, ErrorCode.CHANNEL_NOT_AVAILABLE);
    }
    if (!this.httpAllowed && !input.endpoint.startsWith('https://')) {
      throw new CodedException(HttpStatus.BAD_REQUEST, ErrorCode.VALIDATION_FAILED);
    }
    const before = await this.devices.findByEndpoint(input.endpoint);
    const device = deviceFrom(input.userAgent);
    const saved = await this.devices.upsert({
      userId: user.id,
      endpoint: input.endpoint,
      endpointHash: endpointHash(input.endpoint),
      p256dh: input.keys.p256dh,
      auth: input.keys.auth,
      browser: device.browser,
      os: device.os,
      locale: input.locale,
    });
    const isNew = !before || before.revokedAt !== null || before.userId !== user.id;
    await this.audit.record({
      action: 'core.push_device.add',
      entity: { type: AuditEntityType.PUSH_DEVICE, id: saved.id, label: deviceLabel(saved) },
      // Already this person's and on: nothing changed that the log keeps (no entry is written).
      ...(isNew ? {} : { changes: [] }),
    });
    await this.trim(user.id);
    return this.list(user);
  }

  /** "Alerts on this device" turned off: the browser's endpoint stops getting alerts. */
  async removeByEndpoint(user: Pick<AuthUser, 'id'>, endpoint: string): Promise<PushDevices> {
    const found = await this.devices.findByEndpoint(endpoint);
    const own = found && found.userId === user.id && found.revokedAt === null ? found : null;
    await this.audit.record({
      action: 'core.push_device.remove',
      entity: {
        type: AuditEntityType.PUSH_DEVICE,
        id: own?.id ?? endpointHash(endpoint),
        label: own ? deviceLabel(own) : 'A browser on a device',
      },
      // Not one of this person's devices (already off): nothing to record.
      ...(own ? {} : { changes: [] }),
    });
    if (own) await this.devices.revoke([own.id], 'removed', new Date());
    return this.list(user);
  }

  /** My devices → Remove. Another person's device, or one already removed, is a 404. */
  async remove(user: Pick<AuthUser, 'id'>, id: string): Promise<PushDevices> {
    const own = await this.devices.findOwn(user.id, id);
    if (!own) throw new NotFoundException();
    await this.devices.revoke([own.id], 'removed', new Date());
    await this.audit.record({
      action: 'core.push_device.remove',
      entity: { type: AuditEntityType.PUSH_DEVICE, id: own.id, label: deviceLabel(own) },
    });
    return this.list(user);
  }

  /** Keeps at most `PUSH_DEVICES_MAX` devices: the ones unused longest go first (not audited: no person did it). */
  private async trim(userId: string): Promise<void> {
    const active = await this.devices.activeOf(userId);
    if (active.length <= PUSH_DEVICES_MAX) return;
    const byUse = [...active].sort(
      (a, b) => (a.lastUsedAt ?? a.createdAt).getTime() - (b.lastUsedAt ?? b.createdAt).getTime(),
    );
    await this.devices.revoke(
      byUse.slice(0, active.length - PUSH_DEVICES_MAX).map((d) => d.id),
      'replaced',
      new Date(),
    );
  }
}
