import { Module } from '@nestjs/common';
import { CustomersModule } from '../customers/customers.module';
import { SuppliersModule } from '../suppliers/suppliers.module';
import { AccountingService } from './accounting.service';
import { ReportsService } from './reports.service';
import { AccountingController } from './accounting.controller';

@Module({
  imports: [CustomersModule, SuppliersModule],
  controllers: [AccountingController],
  providers: [AccountingService, ReportsService],
  exports: [AccountingService, ReportsService],
})
export class AccountingModule {}
