import { Body, Controller, Get, Post, Query } from '@nestjs/common';
import { RequirePermissions } from '../common/decorators/permissions.decorator';
import { CurrentUser, AuthenticatedUser } from '../common/decorators/current-user.decorator';
import { InventoryService } from './inventory.service';
import { AdjustStockDto } from './dto/inventory.dto';

@Controller('inventory')
export class InventoryController {
  constructor(private readonly inventoryService: InventoryService) {}

  @Get('stock')
  @RequirePermissions('inventory.view')
  findStock(@Query('productId') productId?: string, @Query('warehouseId') warehouseId?: string) {
    return this.inventoryService.findStock(productId, warehouseId);
  }

  @Get('low-stock')
  @RequirePermissions('inventory.view')
  findLowStock() {
    return this.inventoryService.findLowStock();
  }

  @Post('adjust')
  @RequirePermissions('inventory.manage')
  adjustStock(@Body() dto: AdjustStockDto, @CurrentUser() user: AuthenticatedUser) {
    return this.inventoryService.adjustStock(dto, user.id);
  }

  @Get('movements')
  @RequirePermissions('inventory.view')
  findMovements(
    @Query('productId') productId?: string,
    @Query('warehouseId') warehouseId?: string,
    @Query('type') type?: string,
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
  ) {
    return this.inventoryService.findMovements({
      productId,
      warehouseId,
      type,
      page: page ? Number(page) : undefined,
      pageSize: pageSize ? Number(pageSize) : undefined,
    });
  }
}
