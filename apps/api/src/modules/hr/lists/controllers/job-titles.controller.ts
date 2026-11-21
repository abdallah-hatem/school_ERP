import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post, Query } from '@nestjs/common';
import type { AuthUser } from '@school-erp/shared';
import { CurrentUser } from '../../../../common/decorators/current-user.decorator';
import { CreateJobTitleDto, ListItemsQueryDto, UpdateJobTitleDto, wantsPage } from '../dto/list-item.dto';
import { JobTitlesService } from '../services/job-titles.service';
import { ResponseUtil } from '../../../../common/utils/response.util';
import { Audited } from '../../../../core/audit';
import { Permission } from '../../../../core/permissions';

/**
 * `/hr/job-titles` — GET, POST, PATCH :id. No DELETE: hide with `isActive: false` (§3). Each title
 * also carries `managesPeople` (who can be a direct manager).
 */
@Controller('hr/job-titles')
export class JobTitlesController {
  constructor(private readonly jobTitles: JobTitlesService) {}

  @Get()
  @Permission('hr.lists.view')
  async list(@Query() query: ListItemsQueryDto) {
    // A page (Settings) or the whole list (a form's or filter's choices).
    if (wantsPage(query)) return ResponseUtil.paginated(await this.jobTitles.page(query));
    return this.jobTitles.list(query.includeHidden);
  }

  @Audited('hr.job_title.create')
  @Post()
  @Permission('hr.lists.manage')
  create(@Body() dto: CreateJobTitleDto, @CurrentUser() user?: AuthUser) {
    return this.jobTitles.create(dto, user?.id ?? null);
  }

  @Audited('hr.job_title.update')
  @Patch(':id')
  @Permission('hr.lists.manage')
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateJobTitleDto,
    @CurrentUser() user?: AuthUser,
  ) {
    return this.jobTitles.update(id, dto, user?.id ?? null);
  }
}
