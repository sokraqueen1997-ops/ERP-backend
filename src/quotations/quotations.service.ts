import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { SalesService } from '../sales/sales.service';
import {
  ConvertQuotationDto,
  CreateQuotationDto,
  UpdateQuotationDto,
} from './dto/quotation.dto';

const PRICE_FIELD_BY_CUSTOMER_TYPE: Record<string, 'priceRetail' | 'priceWholesale' | 'priceContractor' | 'priceProject'> = {
  RETAIL: 'priceRetail',
  WHOLESALE: 'priceWholesale',
  CONTRACTOR: 'priceContractor',
  PROJECT: 'priceProject',
};

const OPEN_STATUSES = ['DRAFT', 'SENT', 'ACCEPTED', 'REJECTED', 'EXPIRED'];
const CONVERTIBLE_STATUSES = ['DRAFT', 'SENT', 'ACCEPTED'];

export interface QuotationQuery {
  customerId?: string;
  branchId?: string;
  status?: string;
  page?: number;
  pageSize?: number;
}

@Injectable()
export class QuotationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly salesService: SalesService,
  ) {}

  private static quoteNumber(quoteSeq: number): string {
    return `QT-${String(quoteSeq).padStart(6, '0')}`;
  }

  private withQuoteNumber<T extends { quoteSeq: number; validUntil: Date; status: string }>(q: T) {
    const isExpired = q.status !== 'CONVERTED' && q.validUntil.getTime() < Date.now();
    return { ...q, quoteNumber: QuotationsService.quoteNumber(q.quoteSeq), isExpired };
  }

  /** Builds priced line items + totals; shared by create() and revise(). */
  private async buildLines(customerId: string, items: CreateQuotationDto['items']) {
    const customer = await this.prisma.customer.findUnique({ where: { id: customerId } });
    if (!customer || !customer.isActive) throw new BadRequestException('Invalid or inactive customerId');

    const priceField = PRICE_FIELD_BY_CUSTOMER_TYPE[customer.customerType] ?? 'priceRetail';
    const productIds = items.map((i) => i.productId);
    const products = await this.prisma.product.findMany({ where: { id: { in: productIds } } });
    const productMap = new Map(products.map((p) => [p.id, p] as const));

    let subtotal = 0;
    let vatTotal = 0;
    const lineData = items.map((item) => {
      const product = productMap.get(item.productId);
      if (!product || !product.isActive) {
        throw new BadRequestException(`Invalid or inactive productId: ${item.productId}`);
      }

      const unitPrice = item.unitPrice ?? Number(product[priceField]);
      const lineDiscount = item.discountAmount ?? 0;
      const lineSubtotal = unitPrice * item.quantity - lineDiscount;
      const lineVat = product.isVatApplicable ? lineSubtotal * (Number(product.vatRate) / 100) : 0;
      const lineTotal = lineSubtotal + lineVat;

      subtotal += lineSubtotal;
      vatTotal += lineVat;

      return {
        productId: item.productId,
        quantity: item.quantity,
        unitPrice,
        discountAmount: lineDiscount,
        vatAmount: lineVat,
        lineTotal,
      };
    });

    return { lineData, subtotal, vatTotal };
  }

  async create(dto: CreateQuotationDto, userId?: string) {
    const [branch] = await Promise.all([
      this.prisma.branch.findUnique({ where: { id: dto.branchId } }),
    ]);
    if (!branch) throw new BadRequestException('Invalid branchId');

    const { lineData, subtotal, vatTotal } = await this.buildLines(dto.customerId, dto.items);
    const headerDiscount = dto.discountAmount ?? 0;
    const totalAmount = subtotal - headerDiscount + vatTotal;

    const created = await this.prisma.quotation.create({
      data: {
        customerId: dto.customerId,
        branchId: dto.branchId,
        validUntil: new Date(dto.validUntil),
        subtotal,
        discountAmount: headerDiscount,
        vatAmount: vatTotal,
        totalAmount,
        notes: dto.notes,
        createdById: userId,
        items: { create: lineData },
      },
      include: { items: { include: { product: { select: { id: true, name: true, sku: true } } } } },
    });

    return this.withQuoteNumber(created);
  }

  /** Full in-place edit — only while the quotation is still a DRAFT. */
  async update(id: string, dto: UpdateQuotationDto) {
    const existing = await this.prisma.quotation.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('Quotation not found');
    if (existing.status !== 'DRAFT') {
      throw new BadRequestException('Only DRAFT quotations can be edited; use /revise instead');
    }

    const { lineData, subtotal, vatTotal } = await this.buildLines(dto.customerId, dto.items);
    const headerDiscount = dto.discountAmount ?? 0;
    const totalAmount = subtotal - headerDiscount + vatTotal;

    const updated = await this.prisma.$transaction(async (tx) => {
      await tx.quotationItem.deleteMany({ where: { quotationId: id } });
      return tx.quotation.update({
        where: { id },
        data: {
          customerId: dto.customerId,
          branchId: dto.branchId,
          validUntil: new Date(dto.validUntil),
          subtotal,
          discountAmount: headerDiscount,
          vatAmount: vatTotal,
          totalAmount,
          notes: dto.notes,
          items: { create: lineData },
        },
        include: { items: { include: { product: { select: { id: true, name: true, sku: true } } } } },
      });
    });

    return this.withQuoteNumber(updated);
  }

  async send(id: string) {
    const q = await this.prisma.quotation.findUnique({ where: { id } });
    if (!q) throw new NotFoundException('Quotation not found');
    if (q.status !== 'DRAFT') {
      throw new BadRequestException(`Cannot send a quotation with status ${q.status}`);
    }
    const updated = await this.prisma.quotation.update({
      where: { id },
      data: { status: 'SENT', sentAt: new Date() },
    });
    return this.withQuoteNumber(updated);
  }

  async respond(id: string, accepted: boolean) {
    const q = await this.prisma.quotation.findUnique({ where: { id } });
    if (!q) throw new NotFoundException('Quotation not found');
    if (q.status !== 'SENT') {
      throw new BadRequestException(`Cannot record a response for a quotation with status ${q.status}`);
    }
    const updated = await this.prisma.quotation.update({
      where: { id },
      data: { status: accepted ? 'ACCEPTED' : 'REJECTED', respondedAt: new Date() },
    });
    return this.withQuoteNumber(updated);
  }

  /** Creates a new version linked to this one; the original is marked REVISED. */
  async revise(id: string, dto: UpdateQuotationDto, userId?: string) {
    const existing = await this.prisma.quotation.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('Quotation not found');
    if (!OPEN_STATUSES.includes(existing.status)) {
      throw new BadRequestException(`Cannot revise a quotation with status ${existing.status}`);
    }

    const { lineData, subtotal, vatTotal } = await this.buildLines(dto.customerId, dto.items);
    const headerDiscount = dto.discountAmount ?? 0;
    const totalAmount = subtotal - headerDiscount + vatTotal;

    const newVersion = await this.prisma.$transaction(async (tx) => {
      await tx.quotation.update({ where: { id }, data: { status: 'REVISED' } });
      return tx.quotation.create({
        data: {
          customerId: dto.customerId,
          branchId: dto.branchId,
          validUntil: new Date(dto.validUntil),
          version: existing.version + 1,
          previousVersionId: id,
          subtotal,
          discountAmount: headerDiscount,
          vatAmount: vatTotal,
          totalAmount,
          notes: dto.notes,
          createdById: userId,
          items: { create: lineData },
        },
        include: { items: { include: { product: { select: { id: true, name: true, sku: true } } } } },
      });
    });

    return this.withQuoteNumber(newVersion);
  }

  /** Converts an accepted quotation into a real Sale, preserving negotiated prices. */
  async convert(id: string, dto: ConvertQuotationDto, userId?: string) {
    const quotation = await this.prisma.quotation.findUnique({
      where: { id },
      include: { items: true },
    });
    if (!quotation) throw new NotFoundException('Quotation not found');
    if (!CONVERTIBLE_STATUSES.includes(quotation.status)) {
      throw new BadRequestException(`Cannot convert a quotation with status ${quotation.status}`);
    }

    const sale = await this.salesService.create(
      {
        customerId: quotation.customerId,
        branchId: quotation.branchId,
        warehouseId: dto.warehouseId,
        paymentMethod: dto.paymentMethod,
        discountAmount: Number(quotation.discountAmount),
        notes: `Converted from ${QuotationsService.quoteNumber(quotation.quoteSeq)}`,
        items: quotation.items.map((item) => ({
          productId: item.productId,
          quantity: item.quantity,
          unitPrice: Number(item.unitPrice),
          discountAmount: Number(item.discountAmount),
        })),
      },
      userId,
    );

    const updated = await this.prisma.quotation.update({
      where: { id },
      data: { status: 'CONVERTED', convertedSaleId: sale.id },
      include: { items: { include: { product: { select: { id: true, name: true, sku: true } } } } },
    });

    return { quotation: this.withQuoteNumber(updated), sale };
  }

  async findAll(query: QuotationQuery) {
    const page = query.page && query.page > 0 ? query.page : 1;
    const pageSize = query.pageSize && query.pageSize > 0 ? Math.min(query.pageSize, 100) : 25;

    const where = {
      customerId: query.customerId,
      branchId: query.branchId,
      status: query.status,
    };

    const [items, total] = await Promise.all([
      this.prisma.quotation.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
        include: {
          customer: { select: { id: true, name: true } },
          branch: { select: { id: true, name: true } },
        },
      }),
      this.prisma.quotation.count({ where }),
    ]);

    return {
      items: items.map((q) => this.withQuoteNumber(q)),
      total,
      page,
      pageSize,
      totalPages: Math.ceil(total / pageSize),
    };
  }

  async findOne(id: string) {
    const q = await this.prisma.quotation.findUnique({
      where: { id },
      include: {
        customer: { select: { id: true, name: true, customerType: true } },
        branch: { select: { id: true, name: true } },
        items: { include: { product: { select: { id: true, name: true, sku: true, unit: true } } } },
        previousVersion: { select: { id: true, quoteSeq: true, version: true } },
        nextVersion: { select: { id: true, quoteSeq: true, version: true } },
      },
    });
    if (!q) throw new NotFoundException('Quotation not found');
    return this.withQuoteNumber(q);
  }
}
