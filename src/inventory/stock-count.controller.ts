import { Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { RequirePermissions } from '../common/decorators/permissions.decorator';
import { CurrentUser, AuthenticatedUser } from '../common/decorators/current-user.decorator';
import { StockCountService } from './stock-count.service';
import { CreateStockCountDto, UpdateStockCountLinesDto } from './dto/stock-count.dto';

@Controller('inventory/stock-counts')
export class StockCountController {
  constructor(private readonly stockCountService: StockCountService) {}

  @Get()
  @RequirePermissions('inventory.view')
  findAll(
    @Query('warehouseId') warehouseId?: string,
    @Query('status') status?: string,
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
  ) {
    return this.stockCountService.findAll({
      warehouseId,
      status,
      page: page ? Number(page) : undefined,
      pageSize: pageSize ? Number(pageSize) : undefined,
    });
  }

  @Get(':id')
  @RequirePermissions('inventory.view')
  findOne(@Param('id') id: string) {
    return this.stockCountService.findOne(id);
  }

  @Post()
  @RequirePermissions('inventory.manage')
  create(@Body() dto: CreateStockCountDto, @CurrentUser() user: AuthenticatedUser) {
    return this.stockCountService.create(dto, user.id);
  }

  @Patch(':id/lines')
  @RequirePermissions('inventory.manage')
  updateLines(@Param('id') id: string, @Body() dto: UpdateStockCountLinesDto) {
    return this.stockCountService.updateLines(id, dto);
  }

  @Post(':id/complete')
  @RequirePermissions('inventory.manage')
  complete(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.stockCountService.complete(id, user.id);
  }

  @Post(':id/cancel')
  @RequirePermissions('inventory.manage')
  cancel(@Param('id') id: string) {
    return this.stockCountService.cancel(id);
  }
}
