import { Module } from '@nestjs/common';
import { AuditModule } from '../audit';
import { PermissionsModule } from '../permissions';
import { SettingsModule } from '../settings';
import { InAppChannel, NotificationChannels } from './channels';
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
import { NotificationPreferencesRepository } from './repositories/notification-preferences.repository';
import { NotificationsRepository } from './repositories/notifications.repository';
import { RecipientsRepository } from './repositories/recipients.repository';

/**
 * core/notifications (§11) — the mechanism: tables, the type registry, the recipient resolver,
 * preferences, channels, the bell API and retention. Modules own their types and send through the
 * exported `NotificationsService`; core never imports a module. `NotificationTypes` is exported for
 * tests that register a test-only type.
 */
@Module({
  imports: [AuditModule, PermissionsModule, SettingsModule],
  controllers: [NotificationsController, NotificationSettingsController],
  providers: [
    NotificationsService,
    NotificationInbox,
    NotificationPreferencesService,
    NotificationAccess,
    NotificationScopes,
    NotificationTypes,
    InAppChannel,
    NotificationChannels,
    NotificationsRepository,
    NotificationPreferencesRepository,
    RecipientsRepository,
    NotificationsPurgeJob,
  ],
  exports: [NotificationsService, NotificationTypes],
})
export class NotificationsModule {}
