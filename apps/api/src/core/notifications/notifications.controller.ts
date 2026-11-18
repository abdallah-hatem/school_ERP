import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  Put,
  Query,
  Req,
} from '@nestjs/common';
import {
  NOTIFICATIONS_PAGE,
  type ApiResponse,
  type AuthUser,
  type NotificationItem,
  type NotificationPreferences,
  type NotificationSettings,
  type NotificationsReadAll,
  type NotificationUnreadCount,
} from '@school-erp/shared';
import type { Request } from 'express';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { ResponseUtil } from '../../common/utils/response.util';
import { Audited, NotAudited } from '../audit';
import { Permission, SignedIn } from '../permissions';
import {
  ListNotificationsQueryDto,
  ReadAllNotificationsDto,
  UpdateNotificationPreferencesDto,
  UpdateNotificationSettingsDto,
} from './dto/notifications.dto';
import { NotificationInbox } from './notification-inbox.service';
import { NotificationPreferencesService } from './notification-preferences.service';

const READ_STATE = 'personal read state, not school data';

/**
 * The bell and My account → Notifications (spec → API). Every route is the signed-in user's own:
 * the recipient comes from the token, never a parameter; another person's notification is a 404.
 */
@Controller('notifications')
export class NotificationsController {
  constructor(
    private readonly inbox: NotificationInbox,
    private readonly preferences: NotificationPreferencesService,
  ) {}

  @Get()
  @SignedIn()
  async list(
    @CurrentUser() me: AuthUser,
    @Query() query: ListNotificationsQueryDto,
    @Req() req: Request,
  ): Promise<ApiResponse<NotificationItem[]>> {
    const page = await this.inbox.list(me, {
      page: query.page ?? 1,
      limit: query.limit ?? NOTIFICATIONS_PAGE.defaultLimit,
      status: query.status ?? 'all',
      category: query.category,
    });
    return ResponseUtil.paginated(page, undefined, req.url);
  }

  @Get('unread-count')
  @SignedIn()
  unreadCount(@CurrentUser() me: AuthUser): Promise<NotificationUnreadCount> {
    return this.inbox.unreadCount(me);
  }

  @Post('read-all')
  @SignedIn()
  @NotAudited(READ_STATE)
  @HttpCode(HttpStatus.OK)
  readAll(
    @CurrentUser() me: AuthUser,
    @Body() dto: ReadAllNotificationsDto,
  ): Promise<NotificationsReadAll> {
    return this.inbox.readAll(me, new Date(dto.upTo));
  }

  @Post(':id/read')
  @SignedIn()
  @NotAudited(READ_STATE)
  @HttpCode(HttpStatus.OK)
  read(
    @CurrentUser() me: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<NotificationItem> {
    return this.inbox.markRead(me, id);
  }

  @Post(':id/unread')
  @SignedIn()
  @NotAudited(READ_STATE)
  @HttpCode(HttpStatus.OK)
  unread(
    @CurrentUser() me: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<NotificationItem> {
    return this.inbox.markUnread(me, id);
  }

  @Get('preferences')
  @SignedIn()
  getPreferences(@CurrentUser() me: AuthUser): Promise<NotificationPreferences> {
    return this.preferences.preferencesOf(me);
  }

  @Put('preferences')
  @SignedIn()
  @Audited('core.notification_preferences.update')
  updatePreferences(
    @CurrentUser() me: AuthUser,
    @Body() dto: UpdateNotificationPreferencesDto,
  ): Promise<NotificationPreferences> {
    return this.preferences.updatePreferences(me, dto.items);
  }
}

/**
 * Settings → Notifications: the school's default per type and channel, and the retention. The
 * System admin changes it; the HR manager sees it read-only (owner, 2026-11-18).
 */
@Controller('settings/notifications')
export class NotificationSettingsController {
  constructor(private readonly preferences: NotificationPreferencesService) {}

  @Get()
  @Permission('core.notifications.view')
  get(): Promise<NotificationSettings> {
    return this.preferences.settingsOf();
  }

  @Put()
  @Permission('core.notifications.manage')
  @Audited('core.notification_settings.update')
  update(
    @CurrentUser() me: AuthUser,
    @Body() dto: UpdateNotificationSettingsDto,
  ): Promise<NotificationSettings> {
    return this.preferences.updateSettings(me, dto);
  }
}
