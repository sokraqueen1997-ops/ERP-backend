import { Body, Controller, Get, Header, Param, Post, Query } from '@nestjs/common';
import { RequirePermissions } from '../common/decorators/permissions.decorator';
import { CurrentUser, AuthenticatedUser } from '../common/decorators/current-user.decorator';
import { SalesService } from './sales.service';
import { CreateSaleDto, CreateSaleReturnDto } from './dto/sale.dto';

@Controller('sales')
export class SalesController {
  constructor(private readonly salesService: SalesService) {}

  @Get()
  @RequirePermissions('sales.view')
  findAll(
    @Query('customerId') customerId?: string,
    @Query('branchId') branchId?: string,
    @Query('warehouseId') warehouseId?: string,
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
  ) {
    return this.salesService.findAll({
      customerId,
      branchId,
      warehouseId,
      page: page ? Number(page) : undefined,
      pageSize: pageSize ? Number(pageSize) : undefined,
    });
  }

  @Get(':id')
  @RequirePermissions('sales.view')
  findOne(@Param('id') id: string) {
    return this.salesService.findOne(id);
  }

  @Get(':id/qr-code')
  @RequirePermissions('sales.view')
  qrCode(@Param('id') id: string) {
    return this.salesService.generateQrCode(id);
  }

  @Get(':id/xml')
  @RequirePermissions('sales.view')
  xml(@Param('id') id: string) {
    return this.salesService.generateInvoiceXml(id);
  }

  @Get(':id/invoice')
  @RequirePermissions('sales.view')
  @Header('Content-Type', 'text/html; charset=utf-8')
  invoiceHtml(@Param('id') id: string) {
    return this.salesService.generateInvoiceHtml(id);
  }

  @Post()
  @RequirePermissions('sales.manage')
  create(@Body() dto: CreateSaleDto, @CurrentUser() user: AuthenticatedUser) {
    return this.salesService.create(dto, user.id);
  }

  @Post(':id/returns')
  @RequirePermissions('sales.manage')
  createReturn(
    @Param('id') id: string,
    @Body() dto: CreateSaleReturnDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.salesService.createReturn(id, dto, user.id);
  }
}
