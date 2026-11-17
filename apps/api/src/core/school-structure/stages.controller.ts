import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post, Query } from '@nestjs/common';
import type { AuthUser, Stage } from '@school-erp/shared';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { CreateListItemDto, ListItemsQueryDto, UpdateListItemDto } from './dto/list-item.dto';
import { StagesService } from './stages.service';
import { NotAudited } from '../audit';

/** No DELETE route on purpose: a stage is hidden, never deleted (§3). */
@Controller('stages')
export class StagesController {
  constructor(private readonly stages: StagesService) {}

  @Get()
  list(@Query() query: ListItemsQueryDto): Promise<Stage[]> {
    return this.stages.list(query.includeHidden ?? false);
  }

  @NotAudited('wired in T28')
  @Post()
  create(
    @Body() dto: CreateListItemDto,
    @CurrentUser() user: AuthUser | undefined,
  ): Promise<Stage> {
    return this.stages.create(dto, user?.id ?? null);
  }

  @NotAudited('wired in T28')
  @Patch(':id')
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateListItemDto,
    @CurrentUser() user: AuthUser | undefined,
  ): Promise<Stage> {
    return this.stages.update(id, dto, user?.id ?? null);
  }
}
