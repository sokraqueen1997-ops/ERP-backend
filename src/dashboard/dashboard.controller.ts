import { Controller, Get, Query } from '@nestjs/common';
import { RequirePermissions } from '../common/decorators/permissions.decorator';
import { DashboardService } from './dashboard.service';

@Controller('dashboard')
export class DashboardController {
  constructor(private readonly dashboardService: DashboardService) {}

  @Get('summary')
  @RequirePermissions('reports.view')
  getSummary() {
    return this.dashboardService.getSummary();
  }

  @Get('top-selling-products')
  @RequirePermissions('reports.view')
  topSellingProducts(
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('limit') limit?: string,
  ) {
    return this.dashboardService.topSellingProducts(from, to, limit ? Number(limit) : undefined);
  }

  @Get('slow-moving-products')
  @RequirePermissions('reports.view')
  slowMovingProducts(@Query('days') days?: string) {
    return this.dashboardService.slowMovingProducts(days ? Number(days) : undefined);
  }

  @Get('sales-by-branch')
  @RequirePermissions('reports.view')
  salesByBranch(@Query('from') from?: string, @Query('to') to?: string) {
    return this.dashboardService.salesByBranch(from, to);
  }
}
