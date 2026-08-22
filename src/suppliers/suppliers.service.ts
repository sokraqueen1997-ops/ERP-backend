import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import {
  CreateSupplierDto,
  CreateSupplierTransactionDto,
  UpdateSupplierDto,
} from './dto/supplier.dto';
import { buildStatementHtml } from '../common/utils/statement-html.util';

export interface StatementQuery {
  page?: number;
  pageSize?: number;
  from?: string;
  to?: string;
}

const SUPPLIER_TYPE_LABELS: Record<string, string> = {
  OPENING_BALANCE: 'رصيد افتتاحي',
  PURCHASE: 'مشتريات',
  PAYMENT: 'دفعة',
  DEBIT_NOTE: 'إشعار مدين',
  ADJUSTMENT: 'تسوية',
};

@Injectable()
export class SuppliersService {
  constructor(private readonly prisma: PrismaService) {}

  findAll() {
    return this.prisma.supplier.findMany({ orderBy: { name: 'asc' } });
  }

  async findOne(id: string) {
    const supplier = await this.prisma.supplier.findUnique({ where: { id } });
    if (!supplier) throw new NotFoundException('Supplier not found');
    return supplier;
  }

  create(dto: CreateSupplierDto) {
    return this.prisma.supplier.create({ data: dto });
  }

  async update(id: string, dto: UpdateSupplierDto) {
    await this.findOne(id);
    return this.prisma.supplier.update({ where: { id }, data: dto });
  }

  async remove(id: string) {
    await this.findOne(id);
    const productCount = await this.prisma.product.count({ where: { supplierId: id } });
    if (productCount > 0) {
      throw new ConflictException('Cannot delete a supplier linked to existing products');
    }
    await this.prisma.supplier.delete({ where: { id } });
    return { success: true };
  }

  /** Manual ledger entries (opening balance, payments made, adjustments). */
  async addTransaction(supplierId: string, dto: CreateSupplierTransactionDto, userId?: string) {
    await this.findOne(supplierId);

    return this.prisma.$transaction(async (tx) => {
      const supplier = await tx.supplier.findUniqueOrThrow({ where: { id: supplierId } });
      const newBalance = Number(supplier.balance) + dto.amount;

      await tx.supplier.update({ where: { id: supplierId }, data: { balance: newBalance } });

      const transaction = await tx.supplierTransaction.create({
        data: {
          supplierId,
          type: dto.type,
          amount: dto.amount,
          balanceAfter: newBalance,
          referenceType: 'Manual',
          notes: dto.notes,
          createdById: userId,
        },
      });

      return { transaction, balance: newBalance };
    });
  }

  private dateRangeWhere(from?: string, to?: string) {
    if (!from && !to) return undefined;
    return {
      gte: from ? new Date(from) : undefined,
      lte: to ? new Date(`${to}T23:59:59`) : undefined,
    };
  }

  async findStatement(supplierId: string, query: StatementQuery) {
    await this.findOne(supplierId);

    const page = query.page && query.page > 0 ? query.page : 1;
    const pageSize = query.pageSize && query.pageSize > 0 ? Math.min(query.pageSize, 100) : 25;
    const createdAt = this.dateRangeWhere(query.from, query.to);

    const [items, total] = await Promise.all([
      this.prisma.supplierTransaction.findMany({
        where: { supplierId, ...(createdAt ? { createdAt } : {}) },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.supplierTransaction.count({
        where: { supplierId, ...(createdAt ? { createdAt } : {}) },
      }),
    ]);

    return { items, total, page, pageSize, totalPages: Math.ceil(total / pageSize) };
  }

  /** Full, unpaginated statement rendered as printable HTML (open in a browser tab, then print / save as PDF). */
  async generateStatementHtml(supplierId: string, query: { from?: string; to?: string }) {
    const supplier = await this.findOne(supplierId);
    const createdAt = this.dateRangeWhere(query.from, query.to);

    const items = await this.prisma.supplierTransaction.findMany({
      where: { supplierId, ...(createdAt ? { createdAt } : {}) },
      orderBy: { createdAt: 'asc' },
    });

    const periodLabel =
      query.from || query.to
        ? `الفترة: من ${query.from ?? 'البداية'} إلى ${query.to ?? 'اليوم'}`
        : 'كل الفترة';

    return buildStatementHtml({
      title: 'كشف حساب مورد',
      partyLabel: 'المورد',
      partyName: supplier.name,
      partyPhone: supplier.phone,
      periodLabel,
      lines: items.map((tx) => ({
        date: tx.createdAt.toISOString().slice(0, 10),
        typeLabel: SUPPLIER_TYPE_LABELS[tx.type] ?? tx.type,
        amount: Number(tx.amount),
        balanceAfter: Number(tx.balanceAfter),
        notes: tx.notes,
      })),
      closingBalance: Number(supplier.balance),
      balanceLabel: 'الرصيد الحالي (مستحق له)',
    });
  }
}
