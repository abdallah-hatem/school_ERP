import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post, Query } from '@nestjs/common';
import type { Stage } from '@school-erp/shared';
import { CreateListItemDto, ListItemsQueryDto, UpdateListItemDto } from './dto/list-item.dto';
import { StagesService } from './stages.service';
import { Audited } from '../audit';
import { Permission } from '../permissions';

/** No DELETE route on purpose: a stage is hidden, never deleted (§3). */
@Controller('stages')
export class StagesController {
  constructor(private readonly stages: StagesService) {}

  @Get()
  @Permission('core.stages.view')
  list(@Query() query: ListItemsQueryDto): Promise<Stage[]> {
    return this.stages.list(query.includeHidden ?? false);
  }

  @Audited('core.stage.create')
  @Post()
  @Permission('core.stages.manage')
  create(@Body() dto: CreateListItemDto): Promise<Stage> {
    return this.stages.create(dto);
  }

  @Audited('core.stage.update')
  @Patch(':id')
  @Permission('core.stages.manage')
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateListItemDto,
  ): Promise<Stage> {
    return this.stages.update(id, dto);
  }
}
