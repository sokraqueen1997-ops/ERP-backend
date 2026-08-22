import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import * as QRCode from 'qrcode';
import { PrismaService } from '../prisma/prisma.service';
import { CompanySettingsService } from '../company-settings/company-settings.service';
import { buildPhase1QrFields, buildZatcaQrBase64 } from '../common/utils/zatca-qr.util';
import { buildZatcaInvoiceXml } from '../common/utils/zatca-invoice-xml.util';
import { buildInvoiceHtml } from '../common/utils/invoice-html.util';
import { CreateSaleDto, CreateSaleReturnDto } from './dto/sale.dto';

const PRICE_FIELD_BY_CUSTOMER_TYPE: Record<string, 'priceRetail' | 'priceWholesale' | 'priceContractor' | 'priceProject'> = {
  RETAIL: 'priceRetail',
  WHOLESALE: 'priceWholesale',
  CONTRACTOR: 'priceContractor',
  PROJECT: 'priceProject',
};

/**
 * Formats a Date as "YYYY-MM-DD HH:MM" in Saudi Arabia local time (UTC+3),
 * for human-facing display on the printable invoice. Uses formatToParts
 * (not a locale's default separators) so the output shape is exact and
 * doesn't depend on ICU locale quirks.
 */
function formatSaudiDateTime(date: Date): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Riyadh',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(date);

  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? '';
  return `${get('year')}-${get('month')}-${get('day')} ${get('hour')}:${get('minute')}`;
}

export interface SaleQuery {
  customerId?: string;
  branchId?: string;
  warehouseId?: string;
  page?: number;
  pageSize?: number;
}

@Injectable()
export class SalesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly companySettingsService: CompanySettingsService,
  ) {}

  /** Formats the human-readable invoice number from the DB-native sequence. */
  private static invoiceNumber(invoiceSeq: number): string {
    return `INV-${String(invoiceSeq).padStart(6, '0')}`;
  }

  private withInvoiceNumber<T extends { invoiceSeq: number }>(sale: T) {
    return { ...sale, invoiceNumber: SalesService.invoiceNumber(sale.invoiceSeq) };
  }

  async create(dto: CreateSaleDto, userId?: string) {
    const [customer, branch, warehouse] = await Promise.all([
      this.prisma.customer.findUnique({ where: { id: dto.customerId } }),
      this.prisma.branch.findUnique({ where: { id: dto.branchId } }),
      this.prisma.warehouse.findUnique({ where: { id: dto.warehouseId } }),
    ]);
    if (!customer || !customer.isActive) throw new BadRequestException('Invalid or inactive customerId');
    if (!branch) throw new BadRequestException('Invalid branchId');
    if (!warehouse) throw new BadRequestException('Invalid warehouseId');

    const priceField = PRICE_FIELD_BY_CUSTOMER_TYPE[customer.customerType] ?? 'priceRetail';

    const productIds = dto.items.map((i) => i.productId);
    const [products, stocks] = await Promise.all([
      this.prisma.product.findMany({ where: { id: { in: productIds } } }),
      this.prisma.stock.findMany({
        where: { productId: { in: productIds }, warehouseId: dto.warehouseId },
      }),
    ]);
    const productMap = new Map(products.map((p) => [p.id, p] as const));
    const stockMap = new Map(stocks.map((s) => [s.productId, s.quantity] as const));

    let subtotal = 0;
    let vatTotal = 0;
    const lineData = dto.items.map((item) => {
      const product = productMap.get(item.productId);
      if (!product || !product.isActive) {
        throw new BadRequestException(`Invalid or inactive productId: ${item.productId}`);
      }

      const available = stockMap.get(item.productId) ?? 0;
      if (available < item.quantity) {
        throw new BadRequestException(
          `Insufficient stock for "${product.name}": available ${available}, requested ${item.quantity}`,
        );
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

    const headerDiscount = dto.discountAmount ?? 0;
    const totalAmount = subtotal - headerDiscount + vatTotal;

    const company = await this.companySettingsService.findOrNull();

    const sale = await this.prisma.$transaction(async (tx) => {
      const created = await tx.sale.create({
        data: {
          customerId: dto.customerId,
          branchId: dto.branchId,
          warehouseId: dto.warehouseId,
          subtotal,
          discountAmount: headerDiscount,
          vatAmount: vatTotal,
          totalAmount,
          paymentMethod: dto.paymentMethod,
          notes: dto.notes,
          sellerName: company?.legalNameAr,
          sellerVatNumber: company?.vatNumber,
          createdById: userId,
          items: { create: lineData },
        },
        include: { items: { include: { product: { select: { id: true, name: true, sku: true } } } } },
      });

      for (const item of lineData) {
        await tx.stock.update({
          where: {
            productId_warehouseId: { productId: item.productId, warehouseId: dto.warehouseId },
          },
          data: { quantity: { decrement: item.quantity } },
        });

        const updatedStock = await tx.stock.findUniqueOrThrow({
          where: {
            productId_warehouseId: { productId: item.productId, warehouseId: dto.warehouseId },
          },
        });

        await tx.stockMovement.create({
          data: {
            productId: item.productId,
            warehouseId: dto.warehouseId,
            type: 'SALE_OUT',
            quantity: -item.quantity,
            balanceAfter: updatedStock.quantity,
            referenceType: 'Sale',
            referenceId: created.id,
            createdById: userId,
          },
        });
      }

      const customerAfterInvoice = Number(customer.balance) + totalAmount;
      await tx.customer.update({ where: { id: dto.customerId }, data: { balance: customerAfterInvoice } });
      await tx.customerTransaction.create({
        data: {
          customerId: dto.customerId,
          type: 'INVOICE',
          amount: totalAmount,
          balanceAfter: customerAfterInvoice,
          referenceType: 'Sale',
          referenceId: created.id,
          createdById: userId,
        },
      });

      if (dto.paymentMethod !== 'CREDIT') {
        const customerAfterPayment = customerAfterInvoice - totalAmount;
        await tx.customer.update({ where: { id: dto.customerId }, data: { balance: customerAfterPayment } });
        await tx.customerTransaction.create({
          data: {
            customerId: dto.customerId,
            type: 'PAYMENT',
            amount: -totalAmount,
            balanceAfter: customerAfterPayment,
            referenceType: 'Sale',
            referenceId: created.id,
            notes: `Paid via ${dto.paymentMethod} at time of sale`,
            createdById: userId,
          },
        });
      }

      return created;
    });

    return this.withInvoiceNumber(sale);
  }

  async findAll(query: SaleQuery) {
    const page = query.page && query.page > 0 ? query.page : 1;
    const pageSize = query.pageSize && query.pageSize > 0 ? Math.min(query.pageSize, 100) : 25;

    const where = {
      customerId: query.customerId,
      branchId: query.branchId,
      warehouseId: query.warehouseId,
    };

    const [items, total] = await Promise.all([
      this.prisma.sale.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
        include: {
          customer: { select: { id: true, name: true } },
          branch: { select: { id: true, name: true } },
          warehouse: { select: { id: true, name: true } },
        },
      }),
      this.prisma.sale.count({ where }),
    ]);

    return {
      items: items.map((s) => this.withInvoiceNumber(s)),
      total,
      page,
      pageSize,
      totalPages: Math.ceil(total / pageSize),
    };
  }

  async findOne(id: string) {
    const sale = await this.prisma.sale.findUnique({
      where: { id },
      include: {
        customer: { select: { id: true, name: true, customerType: true, vatNumber: true, phone: true } },
        branch: { select: { id: true, name: true } },
        warehouse: { select: { id: true, name: true } },
        items: { include: { product: { select: { id: true, name: true, sku: true, unit: true } } } },
        returns: { include: { items: true } },
      },
    });
    if (!sale) throw new NotFoundException('Sale not found');
    return this.withInvoiceNumber(sale);
  }

  async createReturn(saleId: string, dto: CreateSaleReturnDto, userId?: string) {
    const sale = await this.prisma.sale.findUnique({
      where: { id: saleId },
      include: { items: true, returns: { include: { items: true } } },
    });
    if (!sale) throw new NotFoundException('Sale not found');

    const alreadyReturnedByProduct = new Map<string, number>();
    for (const ret of sale.returns) {
      for (const item of ret.items) {
        alreadyReturnedByProduct.set(
          item.productId,
          (alreadyReturnedByProduct.get(item.productId) ?? 0) + item.quantity,
        );
      }
    }

    let totalAmount = 0;
    const lineData = dto.items.map((item) => {
      const originalItem = sale.items.find((i) => i.productId === item.productId);
      if (!originalItem) {
        throw new BadRequestException(`Product ${item.productId} was not part of this sale`);
      }

      const alreadyReturned = alreadyReturnedByProduct.get(item.productId) ?? 0;
      const remaining = originalItem.quantity - alreadyReturned;
      if (item.quantity > remaining) {
        throw new BadRequestException(
          `Cannot return ${item.quantity} of product ${item.productId}: only ${remaining} remaining returnable`,
        );
      }

      const perUnitEffective = Number(originalItem.lineTotal) / originalItem.quantity;
      const lineTotal = perUnitEffective * item.quantity;
      totalAmount += lineTotal;

      return {
        productId: item.productId,
        quantity: item.quantity,
        unitPrice: perUnitEffective,
        lineTotal,
      };
    });

    return this.prisma.$transaction(async (tx) => {
      const created = await tx.saleReturn.create({
        data: {
          saleId,
          reason: dto.reason,
          totalAmount,
          createdById: userId,
          items: { create: lineData },
        },
        include: { items: { include: { product: { select: { id: true, name: true, sku: true } } } } },
      });

      for (const item of lineData) {
        await tx.stock.upsert({
          where: {
            productId_warehouseId: { productId: item.productId, warehouseId: sale.warehouseId },
          },
          update: { quantity: { increment: item.quantity } },
          create: { productId: item.productId, warehouseId: sale.warehouseId, quantity: item.quantity },
        });

        const updatedStock = await tx.stock.findUniqueOrThrow({
          where: {
            productId_warehouseId: { productId: item.productId, warehouseId: sale.warehouseId },
          },
        });

        await tx.stockMovement.create({
          data: {
            productId: item.productId,
            warehouseId: sale.warehouseId,
            type: 'RETURN_IN',
            quantity: item.quantity,
            balanceAfter: updatedStock.quantity,
            referenceType: 'SaleReturn',
            referenceId: created.id,
            createdById: userId,
          },
        });
      }

      const customer = await tx.customer.findUniqueOrThrow({ where: { id: sale.customerId } });
      const newBalance = Number(customer.balance) - totalAmount;
      await tx.customer.update({ where: { id: sale.customerId }, data: { balance: newBalance } });
      await tx.customerTransaction.create({
        data: {
          customerId: sale.customerId,
          type: 'CREDIT_NOTE',
          amount: -totalAmount,
          balanceAfter: newBalance,
          referenceType: 'SaleReturn',
          referenceId: created.id,
          createdById: userId,
        },
      });

      return created;
    });
  }

  /** Resolves seller name/VAT: the snapshot on the sale, falling back to current CompanySettings. */
  private async resolveSellerInfo(sale: { sellerName: string | null; sellerVatNumber: string | null }) {
    if (sale.sellerName && sale.sellerVatNumber) {
      return { name: sale.sellerName, vatNumber: sale.sellerVatNumber };
    }
    const company = await this.companySettingsService.findOrNull();
    if (!company) {
      throw new BadRequestException(
        'Company tax settings are not configured. Set them via PATCH /company-settings first.',
      );
    }
    return { name: company.legalNameAr, vatNumber: company.vatNumber };
  }

  /** Phase 1 ZATCA-compliant QR code (5-field TLV) for this sale. */
  async generateQrCode(saleId: string) {
    const sale = await this.findOne(saleId);
    const seller = await this.resolveSellerInfo(sale);

    const fields = buildPhase1QrFields({
      sellerName: seller.name,
      vatNumber: seller.vatNumber,
      timestamp: sale.createdAt,
      invoiceTotal: Number(sale.totalAmount),
      vatTotal: Number(sale.vatAmount),
    });
    const tlvBase64 = buildZatcaQrBase64(fields);
    const qrCodeDataUrl = await QRCode.toDataURL(tlvBase64);

    return { tlvBase64, qrCodeDataUrl };
  }

  /**
   * Unsigned UBL 2.1-shaped invoice XML. See zatca-invoice-xml.util.ts for
   * exactly what is and isn't included (no digital signature yet).
   * NOTE: this timestamp is intentionally left in UTC/ISO form — it's a
   * regulatory document, not something a person reads directly, and ZATCA's
   * expected format is what matters here (not local display time).
   */
  async generateInvoiceXml(saleId: string) {
    const sale = await this.findOne(saleId);
    const seller = await this.resolveSellerInfo(sale);
    const company = await this.companySettingsService.findOrNull();
    const { tlvBase64 } = await this.generateQrCode(saleId);

    const isoCreatedAt = sale.createdAt.toISOString();

    const lines = sale.items.map((item: any) => {
      const lineTotal = Number(item.lineTotal);
      const vatAmount = Number(item.vatAmount);
      const lineExtensionAmount = lineTotal - vatAmount;
      const vatRate = lineExtensionAmount > 0 ? (vatAmount / lineExtensionAmount) * 100 : 0;
      return {
        name: item.product.name,
        quantity: item.quantity,
        unitPrice: Number(item.unitPrice),
        lineExtensionAmount,
        vatAmount,
        vatRate,
      };
    });

    const lineExtensionTotal = lines.reduce((sum, l) => sum + l.lineExtensionAmount, 0);
    const taxExclusiveAmount = Number(sale.subtotal) - Number(sale.discountAmount);
    const taxInclusiveAmount = Number(sale.totalAmount);

    const xml = buildZatcaInvoiceXml({
      invoiceNumber: sale.invoiceNumber,
      uuid: sale.zatcaUuid,
      issueDate: isoCreatedAt.slice(0, 10),
      issueTime: isoCreatedAt.slice(11, 19),
      isStandard: Boolean(sale.customer.vatNumber),
      currency: 'SAR',
      seller: {
        name: seller.name,
        vatNumber: seller.vatNumber,
        buildingNumber: company?.buildingNumber,
        street: company?.streetName,
        city: company?.city,
        postalCode: company?.postalCode,
      },
      buyer: { name: sale.customer.name, vatNumber: sale.customer.vatNumber },
      lines,
      lineExtensionTotal,
      taxExclusiveAmount,
      taxInclusiveAmount,
      vatTotal: Number(sale.vatAmount),
      qrBase64: tlvBase64,
    });

    return { xml, uuid: sale.zatcaUuid, invoiceNumber: sale.invoiceNumber };
  }

  /** Printable/emailable HTML invoice — open directly in a browser and print or save as PDF. */
  async generateInvoiceHtml(saleId: string): Promise<string> {
    const sale = await this.findOne(saleId);
    const seller = await this.resolveSellerInfo(sale);
    const company = await this.companySettingsService.findOrNull();
    const { qrCodeDataUrl } = await this.generateQrCode(saleId);

    const sellerAddressParts = [company?.streetName, company?.city].filter(Boolean);

    // Displayed to a human on the printed invoice — shown in Saudi local time (UTC+3),
    // not the raw UTC timestamp stored in the database.
    const issueDate = formatSaudiDateTime(sale.createdAt);

    return buildInvoiceHtml({
      invoiceNumber: sale.invoiceNumber,
      issueDate,
      status: sale.status,
      paymentMethod: sale.paymentMethod,
      seller: {
        name: seller.name,
        vatNumber: seller.vatNumber,
        address: sellerAddressParts.length ? sellerAddressParts.join('، ') : null,
      },
      buyer: {
        name: sale.customer.name,
        vatNumber: sale.customer.vatNumber,
        phone: sale.customer.phone,
      },
      lines: sale.items.map((item: any) => ({
        name: item.product.name,
        sku: item.product.sku,
        unit: item.product.unit,
        quantity: item.quantity,
        unitPrice: Number(item.unitPrice),
        discountAmount: Number(item.discountAmount),
        vatAmount: Number(item.vatAmount),
        lineTotal: Number(item.lineTotal),
      })),
      subtotal: Number(sale.subtotal),
      discountAmount: Number(sale.discountAmount),
      vatAmount: Number(sale.vatAmount),
      totalAmount: Number(sale.totalAmount),
      qrCodeDataUrl,
    });
  }
}
