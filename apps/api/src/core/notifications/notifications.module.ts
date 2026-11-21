import { Module } from '@nestjs/common';
import { AuditModule } from '../audit';
import { PermissionsModule } from '../permissions';
import { SettingsModule } from '../settings';
import { InAppChannel, NotificationChannels, PushChannel } from './channels';
import { NotificationAccess } from './notification-access.service';
import { NotificationInbox } from './notification-inbox.service';
import { NotificationPreferencesService } from './notification-preferences.service';
import { NotificationScopes } from './notification-scope';
import { NotificationTypes } from './notification-types';
import {
  NotificationSettingsController,
  NotificationsController,
} from './notifications.controller';
import { NotificationsPurgeJob } from './notifications-purge.job';
import { NotificationsService } from './notifications.service';
import { PushDevicesController } from './push/push-devices.controller';
import { PushDevicesService } from './push/push-devices.service';
import { PushSender } from './push/push-sender';
import { PushNotificationListener } from './push/push.listener';
import { NotificationPreferencesRepository } from './repositories/notification-preferences.repository';
import { NotificationsRepository } from './repositories/notifications.repository';
import { PushDevicesRepository } from './repositories/push-devices.repository';
import { RecipientsRepository } from './repositories/recipients.repository';

/**
 * core/notifications (§11) — the mechanism: tables, the type registry, the recipient resolver,
 * preferences, channels (the bell, and Web Push alerts to each person's devices), the bell API and
 * retention. Modules own their types and send through the exported `NotificationsService`; core
 * never imports a module. `NotificationTypes` is exported for tests that register a test-only type,
 * `PushSender` for tests that stand in for the push services.
 */
@Module({
  imports: [AuditModule, PermissionsModule, SettingsModule],
  controllers: [NotificationsController, NotificationSettingsController, PushDevicesController],
  providers: [
    NotificationsService,
    NotificationInbox,
    NotificationPreferencesService,
    NotificationAccess,
    NotificationScopes,
    NotificationTypes,
    InAppChannel,
    PushChannel,
    NotificationChannels,
    NotificationsRepository,
    NotificationPreferencesRepository,
    RecipientsRepository,
    NotificationsPurgeJob,
    PushDevicesRepository,
    PushDevicesService,
    PushSender,
    PushNotificationListener,
  ],
  exports: [NotificationsService, NotificationTypes, PushSender],
})
export class NotificationsModule {}
