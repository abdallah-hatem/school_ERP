import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post, Query } from '@nestjs/common';
import type { AuthUser } from '@school-erp/shared';
import { CurrentUser } from '../../../../common/decorators/current-user.decorator';
import { CreateListItemDto, ListItemsQueryDto, UpdateListItemDto } from '../dto/list-item.dto';
import { JobTitlesService } from '../services/job-titles.service';
import { NotAudited } from '../../../../core/audit';

/** `/hr/job-titles` — GET, POST, PATCH :id. No DELETE: hide with `isActive: false` (§3). */
@Controller('hr/job-titles')
export class JobTitlesController {
  constructor(private readonly jobTitles: JobTitlesService) {}

  @Get()
  list(@Query() query: ListItemsQueryDto) {
    return this.jobTitles.list(query.includeHidden);
  }

  @NotAudited('wired in T28')
  @Post()
  create(@Body() dto: CreateListItemDto, @CurrentUser() user?: AuthUser) {
    return this.jobTitles.create(dto, user?.id ?? null);
  }

  @NotAudited('wired in T28')
  @Patch(':id')
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateListItemDto,
    @CurrentUser() user?: AuthUser,
  ) {
    return this.jobTitles.update(id, dto, user?.id ?? null);
  }
}
