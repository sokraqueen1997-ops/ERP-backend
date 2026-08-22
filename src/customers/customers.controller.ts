import {
  Body,
  Controller,
  Delete,
  Get,
  Header,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { RequirePermissions } from '../common/decorators/permissions.decorator';
import { CurrentUser, AuthenticatedUser } from '../common/decorators/current-user.decorator';
import { CustomersService } from './customers.service';
import {
  CreateCustomerDto,
  CreateCustomerTransactionDto,
  UpdateCustomerDto,
} from './dto/customer.dto';

@Controller('customers')
export class CustomersController {
  constructor(private readonly customersService: CustomersService) {}

  @Get()
  @RequirePermissions('customers.view')
  findAll(@Query('search') search?: string) {
    return this.customersService.findAll(search);
  }

  @Get(':id')
  @RequirePermissions('customers.view')
  findOne(@Param('id') id: string) {
    return this.customersService.findOne(id);
  }

  @Post()
  @RequirePermissions('customers.manage')
  create(@Body() dto: CreateCustomerDto) {
    return this.customersService.create(dto);
  }

  @Patch(':id')
  @RequirePermissions('customers.manage')
  update(@Param('id') id: string, @Body() dto: UpdateCustomerDto) {
    return this.customersService.update(id, dto);
  }

  @Delete(':id')
  @RequirePermissions('customers.manage')
  remove(@Param('id') id: string) {
    return this.customersService.remove(id);
  }

  @Get(':id/statement')
  @RequirePermissions('customers.view')
  findStatement(
    @Param('id') id: string,
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    return this.customersService.findStatement(id, {
      page: page ? Number(page) : undefined,
      pageSize: pageSize ? Number(pageSize) : undefined,
      from,
      to,
    });
  }

  @Get(':id/statement/print')
  @RequirePermissions('customers.view')
  @Header('Content-Type', 'text/html; charset=utf-8')
  printStatement(
    @Param('id') id: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    return this.customersService.generateStatementHtml(id, { from, to });
  }

  @Post(':id/transactions')
  @RequirePermissions('customers.manage')
  addTransaction(
    @Param('id') id: string,
    @Body() dto: CreateCustomerTransactionDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.customersService.addTransaction(id, dto, user.id);
  }
}
