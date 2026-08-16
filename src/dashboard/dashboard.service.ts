import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { InventoryService } from '../inventory/inventory.service';
import { ReportsService } from '../accounting/reports.service';

interface TopSellingEntry {
  product: {
    id: string;
    name: string;
    sku: string;
    unit: string;
  };
  quantity: number;
  revenue: number;
}

interface BranchSalesEntry {
  branchId: string;
  branchName: string;
  salesCount: number;
  total: number;
}

@Injectable()
export class DashboardService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly inventoryService: InventoryService,
    private readonly reportsService: ReportsService,
  ) {}

  async getSummary() {
    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

    const [todaySales, stocks, lowStock, customers, suppliers, accounts, monthPL] = await Promise.all([
      this.prisma.sale.findMany({
        where: { createdAt: { gte: todayStart }, status: 'CONFIRMED' },
        select: { totalAmount: true },
      }),
      this.prisma.stock.findMany({ include: { product: { select: { costPrice: true, isActive: true } } } }),
      this.inventoryService.findLowStock(),
      this.prisma.customer.findMany({ select: { balance: true } }),
      this.prisma.supplier.findMany({ select: { balance: true } }),
      this.prisma.account.findMany({ where: { isActive: true }, select: { balance: true } }),
      this.reportsService.profitLoss(monthStart.toISOString(), now.toISOString()),
    ]);

    let inventoryValue = 0;
    let unvaluedStockLines = 0;
    for (const s of stocks) {
      if (!s.product.isActive) continue;
      if (s.product.costPrice === null) {
        unvaluedStockLines += 1;
        continue;
      }
      inventoryValue += s.quantity * Number(s.product.costPrice);
    }

    return {
      today: {
        salesCount: todaySales.length,
        salesTotal: todaySales.reduce((sum, s) => sum + Number(s.totalAmount), 0),
      },
      inventory: {
        totalValue: inventoryValue,
        unvaluedStockLines, // stock rows for products with no costPrice set — not included in totalValue
        lowStockCount: lowStock.length,
      },
      receivables: {
        totalCustomerBalance: customers.reduce((sum, c) => sum + Number(c.balance), 0),
      },
      payables: {
        totalSupplierBalance: suppliers.reduce((sum, s) => sum + Number(s.balance), 0),
      },
      cashAndBank: {
        totalBalance: accounts.reduce((sum, a) => sum + Number(a.balance), 0),
      },
      thisMonth: {
        revenueExclVat: monthPL.revenueExclVat,
        netProfit: monthPL.netProfit,
      },
    };
  }

  async topSellingProducts(from?: string, to?: string, limit = 10) {
    const fromDate = from ? new Date(from) : new Date(0);
    const toDate = to ? new Date(to) : new Date();

    const items = await this.prisma.saleItem.findMany({
      where: { sale: { createdAt: { gte: fromDate, lte: toDate }, status: 'CONFIRMED' } },
      include: { product: { select: { id: true, name: true, sku: true, unit: true } } },
    });

    const byProduct = new Map<string, TopSellingEntry>();

    for (const item of items) {
      const existing = byProduct.get(item.productId);
      if (existing) {
        existing.quantity += item.quantity;
        existing.revenue += Number(item.lineTotal);
      } else {
        byProduct.set(item.productId, {
          product: item.product,
          quantity: item.quantity,
          revenue: Number(item.lineTotal),
        });
      }
    }

    return [...byProduct.values()]
      .sort((a, b) => b.quantity - a.quantity)
      .slice(0, limit);
  }

  /** Active products that currently hold stock but had no SALE_OUT movement in the last `days` days. */
  async slowMovingProducts(days = 30) {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - days);

    const [stockedProducts, recentSaleMovements] = await Promise.all([
      this.prisma.stock.findMany({
        where: { quantity: { gt: 0 }, product: { isActive: true } },
        include: { product: { select: { id: true, name: true, sku: true, unit: true } } },
      }),
      this.prisma.stockMovement.findMany({
        where: { type: 'SALE_OUT', createdAt: { gte: cutoff } },
        select: { productId: true },
      }),
    ]);

    const recentlySoldIds = new Set(recentSaleMovements.map((m) => m.productId));
    const seen = new Set<string>();
    const slowMoving: { id: string; name: string; sku: string; unit: string; totalQuantity: number }[] = [];

    for (const s of stockedProducts) {
      if (recentlySoldIds.has(s.productId) || seen.has(s.productId)) continue;
      seen.add(s.productId);
      slowMoving.push({ ...s.product, totalQuantity: s.quantity });
    }

    return { cutoffDays: days, products: slowMoving };
  }

  async salesByBranch(from?: string, to?: string) {
    const fromDate = from ? new Date(from) : new Date(0);
    const toDate = to ? new Date(to) : new Date();

    const sales = await this.prisma.sale.findMany({
      where: { createdAt: { gte: fromDate, lte: toDate }, status: 'CONFIRMED' },
      select: { branchId: true, totalAmount: true, branch: { select: { name: true } } },
    });

    const byBranch = new Map<string, BranchSalesEntry>();
    for (const sale of sales) {
      const existing = byBranch.get(sale.branchId);
      if (existing) {
        existing.salesCount += 1;
        existing.total += Number(sale.totalAmount);
      } else {
        byBranch.set(sale.branchId, {
          branchId: sale.branchId,
          branchName: sale.branch.name,
          salesCount: 1,
          total: Number(sale.totalAmount),
        });
      }
    }

    return [...byBranch.values()].sort((a, b) => b.total - a.total);
  }
}
