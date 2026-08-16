import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { RequirePermissions } from '../common/decorators/permissions.decorator';
import { CurrentUser, AuthenticatedUser } from '../common/decorators/current-user.decorator';
import { TransfersService } from './transfers.service';
import { CreateStockTransferDto } from './dto/transfer.dto';

@Controller('inventory/transfers')
export class TransfersController {
  constructor(private readonly transfersService: TransfersService) {}

  @Get()
  @RequirePermissions('inventory.view')
  findAll(
    @Query('fromWarehouseId') fromWarehouseId?: string,
    @Query('toWarehouseId') toWarehouseId?: string,
    @Query('status') status?: string,
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
  ) {
    return this.transfersService.findAll({
      fromWarehouseId,
      toWarehouseId,
      status,
      page: page ? Number(page) : undefined,
      pageSize: pageSize ? Number(pageSize) : undefined,
    });
  }

  @Get(':id')
  @RequirePermissions('inventory.view')
  findOne(@Param('id') id: string) {
    return this.transfersService.findOne(id);
  }

  @Post()
  @RequirePermissions('inventory.manage')
  create(@Body() dto: CreateStockTransferDto, @CurrentUser() user: AuthenticatedUser) {
    return this.transfersService.create(dto, user.id);
  }

  @Post(':id/ship')
  @RequirePermissions('inventory.manage')
  ship(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.transfersService.ship(id, user.id);
  }

  @Post(':id/receive')
  @RequirePermissions('inventory.manage')
  receive(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.transfersService.receive(id, user.id);
  }

  @Post(':id/cancel')
  @RequirePermissions('inventory.manage')
  cancel(@Param('id') id: string) {
    return this.transfersService.cancel(id);
  }
}
