import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_INTERCEPTOR } from '@nestjs/core';
import { PrismaModule } from './prisma/prisma.module';
import { AuthModule } from './auth/auth.module';
import { UsersModule } from './users/users.module';
import { RolesModule } from './roles/roles.module';
import { PermissionsModule } from './permissions/permissions.module';
import { BranchesModule } from './branches/branches.module';
import { AuditLogModule } from './audit-log/audit-log.module';
import { CategoriesModule } from './categories/categories.module';
import { SuppliersModule } from './suppliers/suppliers.module';
import { WarehousesModule } from './warehouses/warehouses.module';
import { ProductsModule } from './products/products.module';
import { InventoryModule } from './inventory/inventory.module';
import { CustomersModule } from './customers/customers.module';
import { SalesModule } from './sales/sales.module';
import { PurchasesModule } from './purchases/purchases.module';
import { QuotationsModule } from './quotations/quotations.module';
import { CompanySettingsModule } from './company-settings/company-settings.module';
import { AccountingModule } from './accounting/accounting.module';
import { DashboardModule } from './dashboard/dashboard.module';
import { AuditLogInterceptor } from './common/interceptors/audit-log.interceptor';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    PrismaModule,
    AuthModule,
    UsersModule,
    RolesModule,
    PermissionsModule,
    BranchesModule,
    AuditLogModule,
    CategoriesModule,
    SuppliersModule,
    WarehousesModule,
    ProductsModule,
    InventoryModule,
    CustomersModule,
    SalesModule,
    PurchasesModule,
    QuotationsModule,
    CompanySettingsModule,
    AccountingModule,
    DashboardModule,
  ],
  providers: [
    {
      provide: APP_INTERCEPTOR,
      useClass: AuditLogInterceptor,
    },
  ],
})
export class AppModule {}
