import { Injectable } from '@nestjs/common';
import { AuditEntityType, HrListKey, JobTitle } from '@school-erp/shared';
import { AuditService } from '../../../../core/audit';
import { AfterCommit } from '../../../../database/transactions';
import type { CreateJobTitleDto, UpdateJobTitleDto } from '../dto/list-item.dto';
import { JobTitlesRepository } from '../repositories/job-titles.repository';
import { ListItemsService } from './list-items.service';

/** Job titles: a list item plus `managesPeople` — who can be chosen as a direct manager (§3). */
@Injectable()
export class JobTitlesService extends ListItemsService<
  JobTitle,
  CreateJobTitleDto,
  UpdateJobTitleDto
> {
  constructor(repository: JobTitlesRepository, audit: AuditService, afterCommit: AfterCommit) {
    super(repository, audit, afterCommit, HrListKey.JOB_TITLES, {
      type: AuditEntityType.JOB_TITLE,
      create: 'hr.job_title.create',
      update: 'hr.job_title.update',
    });
  }

  protected override extraCreateData(dto: CreateJobTitleDto): Record<string, unknown> {
    return dto.managesPeople !== undefined ? { managesPeople: dto.managesPeople } : {};
  }
}
