import { Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { RequirePermissions } from '../common/decorators/permissions.decorator';
import { CurrentUser, AuthenticatedUser } from '../common/decorators/current-user.decorator';
import { AccountingService } from './accounting.service';
import { ReportsService } from './reports.service';
import { CreateAccountDto, UpdateAccountDto } from './dto/account.dto';
import { CreatePaymentDto, CreateReceiptDto } from './dto/voucher.dto';

@Controller('accounting')
export class AccountingController {
  constructor(
    private readonly accountingService: AccountingService,
    private readonly reportsService: ReportsService,
  ) {}

  @Get('accounts')
  @RequirePermissions('accounting.view')
  findAllAccounts() {
    return this.accountingService.findAllAccounts();
  }

  @Get('accounts/:id')
  @RequirePermissions('accounting.view')
  findAccount(@Param('id') id: string) {
    return this.accountingService.findAccount(id);
  }

  @Post('accounts')
  @RequirePermissions('accounting.manage')
  createAccount(@Body() dto: CreateAccountDto) {
    return this.accountingService.createAccount(dto);
  }

  @Patch('accounts/:id')
  @RequirePermissions('accounting.manage')
  updateAccount(@Param('id') id: string, @Body() dto: UpdateAccountDto) {
    return this.accountingService.updateAccount(id, dto);
  }

  @Get('accounts/:id/ledger')
  @RequirePermissions('accounting.view')
  ledger(
    @Param('id') id: string,
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
  ) {
    return this.accountingService.findAccountLedger(id, {
      page: page ? Number(page) : undefined,
      pageSize: pageSize ? Number(pageSize) : undefined,
    });
  }

  @Post('accounts/:id/receipts')
  @RequirePermissions('accounting.manage')
  createReceipt(
    @Param('id') id: string,
    @Body() dto: CreateReceiptDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.accountingService.createReceipt(id, dto, user.id);
  }

  @Post('accounts/:id/payments')
  @RequirePermissions('accounting.manage')
  createPayment(
    @Param('id') id: string,
    @Body() dto: CreatePaymentDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.accountingService.createPayment(id, dto, user.id);
  }

  @Get('reports/profit-loss')
  @RequirePermissions('accounting.view')
  profitLoss(@Query('from') from?: string, @Query('to') to?: string) {
    return this.reportsService.profitLoss(from, to);
  }

  @Get('reports/vat')
  @RequirePermissions('accounting.view')
  vatSummary(@Query('from') from?: string, @Query('to') to?: string) {
    return this.reportsService.vatSummary(from, to);
  }

  @Get('reports/aging')
  @RequirePermissions('accounting.view')
  agingReport() {
    return this.reportsService.agingReport();
  }
}
