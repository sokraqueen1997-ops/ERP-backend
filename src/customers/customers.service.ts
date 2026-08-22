import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import {
  CreateCustomerDto,
  CreateCustomerTransactionDto,
  UpdateCustomerDto,
} from './dto/customer.dto';
import { buildStatementHtml } from '../common/utils/statement-html.util';

export interface StatementQuery {
  page?: number;
  pageSize?: number;
  from?: string;
  to?: string;
}

const CUSTOMER_TYPE_LABELS: Record<string, string> = {
  OPENING_BALANCE: 'رصيد افتتاحي',
  INVOICE: 'فاتورة',
  PAYMENT: 'دفعة',
  CREDIT_NOTE: 'إشعار دائن',
  ADJUSTMENT: 'تسوية',
};

@Injectable()
export class CustomersService {
  constructor(private readonly prisma: PrismaService) {}

  findAll(search?: string) {
    return this.prisma.customer.findMany({
      where: search
        ? {
            OR: [
              { name: { contains: search, mode: 'insensitive' } },
              { phone: { contains: search, mode: 'insensitive' } },
            ],
          }
        : undefined,
      orderBy: { name: 'asc' },
    });
  }

  async findOne(id: string) {
    const customer = await this.prisma.customer.findUnique({ where: { id } });
    if (!customer) throw new NotFoundException('Customer not found');
    return customer;
  }

  create(dto: CreateCustomerDto) {
    return this.prisma.customer.create({ data: dto });
  }

  async update(id: string, dto: UpdateCustomerDto) {
    await this.findOne(id);
    return this.prisma.customer.update({ where: { id }, data: dto });
  }

  async remove(id: string) {
    const customer = await this.findOne(id);
    if (Number(customer.balance) !== 0) {
      throw new ConflictException('Cannot delete a customer with a non-zero balance');
    }
    await this.prisma.customer.delete({ where: { id } });
    return { success: true };
  }

  /**
   * Records a ledger entry and updates the running balance atomically.
   * Used directly for manual entries (opening balance, payments, adjustments)
   * and will also be called internally once the Sales module posts invoices.
   */
  async addTransaction(
    customerId: string,
    dto: CreateCustomerTransactionDto,
    userId?: string,
  ) {
    await this.findOne(customerId);

    return this.prisma.$transaction(async (tx) => {
      const customer = await tx.customer.findUniqueOrThrow({ where: { id: customerId } });
      const newBalance = Number(customer.balance) + dto.amount;

      await tx.customer.update({
        where: { id: customerId },
        data: { balance: newBalance },
      });

      const transaction = await tx.customerTransaction.create({
        data: {
          customerId,
          type: dto.type,
          amount: dto.amount,
          balanceAfter: newBalance,
          referenceType: 'Manual',
          notes: dto.notes,
          createdById: userId,
        },
      });

      const exceedsCreditLimit =
        Number(customer.creditLimit) > 0 && newBalance > Number(customer.creditLimit);

      return { transaction, balance: newBalance, exceedsCreditLimit };
    });
  }

  private dateRangeWhere(from?: string, to?: string) {
    if (!from && !to) return undefined;
    return {
      gte: from ? new Date(from) : undefined,
      lte: to ? new Date(`${to}T23:59:59`) : undefined,
    };
  }

  async findStatement(customerId: string, query: StatementQuery) {
    await this.findOne(customerId);

    const page = query.page && query.page > 0 ? query.page : 1;
    const pageSize = query.pageSize && query.pageSize > 0 ? Math.min(query.pageSize, 100) : 25;
    const createdAt = this.dateRangeWhere(query.from, query.to);

    const [items, total] = await Promise.all([
      this.prisma.customerTransaction.findMany({
        where: { customerId, ...(createdAt ? { createdAt } : {}) },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.customerTransaction.count({
        where: { customerId, ...(createdAt ? { createdAt } : {}) },
      }),
    ]);

    return { items, total, page, pageSize, totalPages: Math.ceil(total / pageSize) };
  }

  /** Full, unpaginated statement rendered as printable HTML (open in a browser tab, then print / save as PDF). */
  async generateStatementHtml(customerId: string, query: { from?: string; to?: string }) {
    const customer = await this.findOne(customerId);
    const createdAt = this.dateRangeWhere(query.from, query.to);

    const items = await this.prisma.customerTransaction.findMany({
      where: { customerId, ...(createdAt ? { createdAt } : {}) },
      orderBy: { createdAt: 'asc' },
    });

    const periodLabel =
      query.from || query.to
        ? `الفترة: من ${query.from ?? 'البداية'} إلى ${query.to ?? 'اليوم'}`
        : 'كل الفترة';

    return buildStatementHtml({
      title: 'كشف حساب عميل',
      partyLabel: 'العميل',
      partyName: customer.name,
      partyPhone: customer.phone,
      periodLabel,
      lines: items.map((tx) => ({
        date: tx.createdAt.toISOString().slice(0, 10),
        typeLabel: CUSTOMER_TYPE_LABELS[tx.type] ?? tx.type,
        amount: Number(tx.amount),
        balanceAfter: Number(tx.balanceAfter),
        notes: tx.notes,
      })),
      closingBalance: Number(customer.balance),
      balanceLabel: 'الرصيد الحالي (مستحق منه)',
    });
  }
}
