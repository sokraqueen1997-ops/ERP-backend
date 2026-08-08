import { Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { RequirePermissions } from '../common/decorators/permissions.decorator';
import { CurrentUser, AuthenticatedUser } from '../common/decorators/current-user.decorator';
import { QuotationsService } from './quotations.service';
import {
  ConvertQuotationDto,
  CreateQuotationDto,
  UpdateQuotationDto,
} from './dto/quotation.dto';

@Controller('quotations')
export class QuotationsController {
  constructor(private readonly quotationsService: QuotationsService) {}

  @Get()
  @RequirePermissions('quotations.view')
  findAll(
    @Query('customerId') customerId?: string,
    @Query('branchId') branchId?: string,
    @Query('status') status?: string,
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
  ) {
    return this.quotationsService.findAll({
      customerId,
      branchId,
      status,
      page: page ? Number(page) : undefined,
      pageSize: pageSize ? Number(pageSize) : undefined,
    });
  }

  @Get(':id')
  @RequirePermissions('quotations.view')
  findOne(@Param('id') id: string) {
    return this.quotationsService.findOne(id);
  }

  @Post()
  @RequirePermissions('quotations.manage')
  create(@Body() dto: CreateQuotationDto, @CurrentUser() user: AuthenticatedUser) {
    return this.quotationsService.create(dto, user.id);
  }

  @Patch(':id')
  @RequirePermissions('quotations.manage')
  update(@Param('id') id: string, @Body() dto: UpdateQuotationDto) {
    return this.quotationsService.update(id, dto);
  }

  @Post(':id/send')
  @RequirePermissions('quotations.manage')
  send(@Param('id') id: string) {
    return this.quotationsService.send(id);
  }

  @Post(':id/accept')
  @RequirePermissions('quotations.manage')
  accept(@Param('id') id: string) {
    return this.quotationsService.respond(id, true);
  }

  @Post(':id/reject')
  @RequirePermissions('quotations.manage')
  reject(@Param('id') id: string) {
    return this.quotationsService.respond(id, false);
  }

  @Post(':id/revise')
  @RequirePermissions('quotations.manage')
  revise(
    @Param('id') id: string,
    @Body() dto: UpdateQuotationDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.quotationsService.revise(id, dto, user.id);
  }

  @Post(':id/convert')
  @RequirePermissions('quotations.manage')
  convert(
    @Param('id') id: string,
    @Body() dto: ConvertQuotationDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.quotationsService.convert(id, dto, user.id);
  }
}
