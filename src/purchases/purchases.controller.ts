import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { RequirePermissions } from '../common/decorators/permissions.decorator';
import { CurrentUser, AuthenticatedUser } from '../common/decorators/current-user.decorator';
import { PurchasesService } from './purchases.service';
import { CreatePurchaseOrderDto, ReceivePurchaseOrderDto } from './dto/purchase.dto';

@Controller('purchases')
export class PurchasesController {
  constructor(private readonly purchasesService: PurchasesService) {}

  @Get()
  @RequirePermissions('purchases.view')
  findAll(
    @Query('supplierId') supplierId?: string,
    @Query('branchId') branchId?: string,
    @Query('status') status?: string,
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
  ) {
    return this.purchasesService.findAll({
      supplierId,
      branchId,
      status,
      page: page ? Number(page) : undefined,
      pageSize: pageSize ? Number(pageSize) : undefined,
    });
  }

  @Get(':id')
  @RequirePermissions('purchases.view')
  findOne(@Param('id') id: string) {
    return this.purchasesService.findOne(id);
  }

  @Post()
  @RequirePermissions('purchases.manage')
  create(@Body() dto: CreatePurchaseOrderDto, @CurrentUser() user: AuthenticatedUser) {
    return this.purchasesService.create(dto, user.id);
  }

  @Post(':id/confirm')
  @RequirePermissions('purchases.manage')
  confirm(@Param('id') id: string) {
    return this.purchasesService.confirm(id);
  }

  @Post(':id/cancel')
  @RequirePermissions('purchases.manage')
  cancel(@Param('id') id: string) {
    return this.purchasesService.cancel(id);
  }

  @Post(':id/receive')
  @RequirePermissions('purchases.manage')
  receive(
    @Param('id') id: string,
    @Body() dto: ReceivePurchaseOrderDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.purchasesService.receive(id, dto, user.id);
  }
}
