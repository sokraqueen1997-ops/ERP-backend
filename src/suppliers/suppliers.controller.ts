import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { RequirePermissions } from '../common/decorators/permissions.decorator';
import { CurrentUser, AuthenticatedUser } from '../common/decorators/current-user.decorator';
import { SuppliersService } from './suppliers.service';
import {
  CreateSupplierDto,
  CreateSupplierTransactionDto,
  UpdateSupplierDto,
} from './dto/supplier.dto';

@Controller('suppliers')
export class SuppliersController {
  constructor(private readonly suppliersService: SuppliersService) {}

  @Get()
  @RequirePermissions('suppliers.view')
  findAll() {
    return this.suppliersService.findAll();
  }

  @Get(':id')
  @RequirePermissions('suppliers.view')
  findOne(@Param('id') id: string) {
    return this.suppliersService.findOne(id);
  }

  @Post()
  @RequirePermissions('suppliers.manage')
  create(@Body() dto: CreateSupplierDto) {
    return this.suppliersService.create(dto);
  }

  @Patch(':id')
  @RequirePermissions('suppliers.manage')
  update(@Param('id') id: string, @Body() dto: UpdateSupplierDto) {
    return this.suppliersService.update(id, dto);
  }

  @Delete(':id')
  @RequirePermissions('suppliers.manage')
  remove(@Param('id') id: string) {
    return this.suppliersService.remove(id);
  }

  @Get(':id/statement')
  @RequirePermissions('suppliers.view')
  findStatement(
    @Param('id') id: string,
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
  ) {
    return this.suppliersService.findStatement(id, {
      page: page ? Number(page) : undefined,
      pageSize: pageSize ? Number(pageSize) : undefined,
    });
  }

  @Post(':id/transactions')
  @RequirePermissions('suppliers.manage')
  addTransaction(
    @Param('id') id: string,
    @Body() dto: CreateSupplierTransactionDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.suppliersService.addTransaction(id, dto, user.id);
  }
}
