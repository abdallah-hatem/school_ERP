import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post, Query } from '@nestjs/common';
import { CreateJobTitleDto, ListItemsQueryDto, UpdateJobTitleDto } from '../dto/list-item.dto';
import { JobTitlesService } from '../services/job-titles.service';
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
  list(@Query() query: ListItemsQueryDto) {
    return this.jobTitles.list(query.includeHidden);
  }

  @Audited('hr.job_title.create')
  @Post()
  @Permission('hr.lists.manage')
  create(@Body() dto: CreateJobTitleDto) {
    return this.jobTitles.create(dto);
  }

  @Audited('hr.job_title.update')
  @Patch(':id')
  @Permission('hr.lists.manage')
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateJobTitleDto,
  ) {
    return this.jobTitles.update(id, dto);
  }
}
