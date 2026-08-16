import { BadRequestException, Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class ReportsService {
  constructor(private readonly prisma: PrismaService) {}

  private parseRange(from?: string, to?: string) {
    if (!from || !to) {
      throw new BadRequestException('Both "from" and "to" query params are required (ISO dates)');
    }
    const fromDate = new Date(from);
    const toDate = new Date(to);
    if (isNaN(fromDate.getTime()) || isNaN(toDate.getTime())) {
      throw new BadRequestException('Invalid "from" or "to" date');
    }
    return { fromDate, toDate };
  }

  /**
   * Approximate profit & loss for a period, built from existing Sales/
   * Returns/expense-voucher data. Two known approximations (see `notes`):
   *   1. VAT on returns isn't separately decomposed, so tax-exclusive
   *      revenue is estimated as (net sales incl. VAT) − (VAT collected on
   *      the original sales), which slightly overstates the VAT deducted
   *      for whatever portion was returned.
   *   2. COGS uses each product's CURRENT costPrice, not a snapshot from
   *      the time of sale (we don't store one yet), so it drifts if costs
   *      change after the fact.
   */
  async profitLoss(from?: string, to?: string) {
    const { fromDate, toDate } = this.parseRange(from, to);
    const notes: string[] = [];

    const [sales, returns, expenseVouchers] = await Promise.all([
      this.prisma.sale.findMany({
        where: { createdAt: { gte: fromDate, lte: toDate }, status: 'CONFIRMED' },
        include: { items: true },
      }),
      this.prisma.saleReturn.findMany({
        where: { createdAt: { gte: fromDate, lte: toDate } },
      }),
      this.prisma.accountTransaction.findMany({
        where: { createdAt: { gte: fromDate, lte: toDate }, type: 'PAYMENT', category: 'EXPENSE' },
      }),
    ]);

    const revenueInclVat = sales.reduce((sum, s) => sum + Number(s.totalAmount), 0);
    const returnsInclVat = returns.reduce((sum, r) => sum + Number(r.totalAmount), 0);
    const vatCollected = sales.reduce((sum, s) => sum + Number(s.vatAmount), 0);
    const netSalesInclVat = revenueInclVat - returnsInclVat;
    const revenueExclVat = netSalesInclVat - vatCollected;

    if (returns.length > 0) {
      notes.push(
        'إجمالي المرتجعات مطروح من الإيراد بالكامل، لكن الضريبة المخصومة من المبيعات لم تُعدَّل بدقة لتعكس نسبة المرتجعات — تقدير تقريبي.',
      );
    }

    const productIds = [...new Set(sales.flatMap((s) => s.items.map((i) => i.productId)))];
    const products = await this.prisma.product.findMany({ where: { id: { in: productIds } } });
    const costMap = new Map(products.map((p) => [p.id, p.costPrice ? Number(p.costPrice) : null] as const));

    let cogs = 0;
    let itemsMissingCost = 0;
    for (const sale of sales) {
      for (const item of sale.items) {
        const cost = costMap.get(item.productId);
        if (cost === null || cost === undefined) {
          itemsMissingCost += 1;
          continue;
        }
        cogs += cost * item.quantity;
      }
    }
    if (itemsMissingCost > 0) {
      notes.push(
        `${itemsMissingCost} بند بيع لمنتجات بدون سعر تكلفة (costPrice) مسجّل — تكلفة البضاعة المباعة أقل من الواقع.`,
      );
    }
    notes.push('تكلفة البضاعة المباعة محسوبة بسعر التكلفة الحالي للمنتج، وليس السعر وقت البيع فعليًا.');

    const grossProfit = revenueExclVat - cogs;
    const totalExpenses = expenseVouchers.reduce((sum, v) => sum + Number(v.amount), 0);
    const netProfit = grossProfit - totalExpenses;

    return {
      period: { from: fromDate.toISOString(), to: toDate.toISOString() },
      revenueInclVat,
      returnsInclVat,
      netSalesInclVat,
      vatCollected,
      revenueExclVat,
      cogs,
      grossProfit,
      totalExpenses,
      netProfit,
      salesCount: sales.length,
      returnsCount: returns.length,
      notes,
    };
  }

  /** Estimated net VAT position (output − input) for a period. Not a substitute for the official ZATCA return. */
  async vatSummary(from?: string, to?: string) {
    const { fromDate, toDate } = this.parseRange(from, to);

    const [sales, purchases] = await Promise.all([
      this.prisma.sale.findMany({
        where: { createdAt: { gte: fromDate, lte: toDate }, status: 'CONFIRMED' },
        select: { vatAmount: true },
      }),
      this.prisma.purchaseOrder.findMany({
        where: {
          createdAt: { gte: fromDate, lte: toDate },
          status: { in: ['RECEIVED', 'PARTIALLY_RECEIVED'] },
        },
        select: { vatAmount: true },
      }),
    ]);

    const outputVat = sales.reduce((sum, s) => sum + Number(s.vatAmount), 0);
    const inputVat = purchases.reduce((sum, p) => sum + Number(p.vatAmount), 0);

    return {
      period: { from: fromDate.toISOString(), to: toDate.toISOString() },
      outputVat,
      inputVat,
      netVatPayable: outputVat - inputVat,
      note: 'تقدير داخلي وليس بديلًا عن إقرار ضريبة القيمة المضافة الرسمي لدى هيئة الزكاة والضريبة والجمارك.',
    };
  }

  /**
   * Accounts-receivable aging: how long each customer has continuously
   * carried a positive balance. Since we keep a running balance rather than
   * matching payments to specific invoices, "age" here means "days since
   * this customer's balance last touched zero or below" — a solid proxy
   * for collections purposes even though it isn't per-invoice aging.
   */
  async agingReport() {
    const customers = await this.prisma.customer.findMany({
      where: { balance: { gt: 0 }, isActive: true },
      include: { transactions: { orderBy: { createdAt: 'asc' } } },
    });

    const now = new Date();
    const bucketDefs = [
      { label: '0-30', max: 30 },
      { label: '31-60', max: 60 },
      { label: '61-90', max: 90 },
      { label: '90+', max: Infinity },
    ];

    const bucketFor = (days: number): string => {
      for (const b of bucketDefs) {
        if (days <= b.max) return b.label;
      }
      return '90+';
    };

    const customerRows = customers.map((customer) => {
      let lastZeroIndex = -1;
      customer.transactions.forEach((tx, idx) => {
        if (Number(tx.balanceAfter) <= 0) lastZeroIndex = idx;
      });
      const agingStartTx = customer.transactions[lastZeroIndex + 1] ?? customer.transactions[0];
      const agingStartDate = agingStartTx ? agingStartTx.createdAt : customer.createdAt;
      const daysOutstanding = Math.max(
        0,
        Math.floor((now.getTime() - agingStartDate.getTime()) / (1000 * 60 * 60 * 24)),
      );

      return {
        customerId: customer.id,
        customerName: customer.name,
        phone: customer.phone,
        balance: Number(customer.balance),
        daysOutstanding,
        bucket: bucketFor(daysOutstanding),
      };
    });

    const buckets = bucketDefs.map((b) => {
      const rows = customerRows.filter((r) => r.bucket === b.label);
      return {
        label: b.label,
        total: rows.reduce((sum, r) => sum + r.balance, 0),
        customerCount: rows.length,
      };
    });

    return {
      asOf: now.toISOString(),
      totalOutstanding: customerRows.reduce((sum, r) => sum + r.balance, 0),
      buckets,
      customers: customerRows.sort((a, b) => b.daysOutstanding - a.daysOutstanding),
      note: 'مبني على تاريخ آخر مرة وصل فيها رصيد العميل للصفر أو أقل، وليس على مطابقة كل فاتورة بمفردها.',
    };
  }
}
