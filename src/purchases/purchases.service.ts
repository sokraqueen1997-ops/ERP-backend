import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreatePurchaseOrderDto, ReceivePurchaseOrderDto } from './dto/purchase.dto';

export interface PurchaseQuery {
  supplierId?: string;
  branchId?: string;
  status?: string;
  page?: number;
  pageSize?: number;
}

@Injectable()
export class PurchasesService {
  constructor(private readonly prisma: PrismaService) {}

  private static orderNumber(orderSeq: number): string {
    return `PO-${String(orderSeq).padStart(6, '0')}`;
  }

  private withOrderNumber<T extends { orderSeq: number }>(po: T) {
    return { ...po, orderNumber: PurchasesService.orderNumber(po.orderSeq) };
  }

  async create(dto: CreatePurchaseOrderDto, userId?: string) {
    const [supplier, branch, warehouse] = await Promise.all([
      this.prisma.supplier.findUnique({ where: { id: dto.supplierId } }),
      this.prisma.branch.findUnique({ where: { id: dto.branchId } }),
      this.prisma.warehouse.findUnique({ where: { id: dto.warehouseId } }),
    ]);
    if (!supplier || !supplier.isActive) throw new BadRequestException('Invalid or inactive supplierId');
    if (!branch) throw new BadRequestException('Invalid branchId');
    if (!warehouse) throw new BadRequestException('Invalid warehouseId');

    const productIds = dto.items.map((i) => i.productId);
    const products = await this.prisma.product.findMany({ where: { id: { in: productIds } } });
    const productMap = new Map(products.map((p) => [p.id, p] as const));

    let subtotal = 0;
    let vatTotal = 0;
    const lineData = dto.items.map((item) => {
      const product = productMap.get(item.productId);
      if (!product || !product.isActive) {
        throw new BadRequestException(`Invalid or inactive productId: ${item.productId}`);
      }

      const lineSubtotal = item.unitCost * item.quantity;
      const lineVat = product.isVatApplicable ? lineSubtotal * (Number(product.vatRate) / 100) : 0;
      const lineTotal = lineSubtotal + lineVat;

      subtotal += lineSubtotal;
      vatTotal += lineVat;

      return {
        productId: item.productId,
        orderedQuantity: item.quantity,
        unitCost: item.unitCost,
        vatAmount: lineVat,
        lineTotal,
      };
    });

    const headerDiscount = dto.discountAmount ?? 0;
    const totalAmount = subtotal - headerDiscount + vatTotal;

    const po = await this.prisma.purchaseOrder.create({
      data: {
        supplierId: dto.supplierId,
        branchId: dto.branchId,
        warehouseId: dto.warehouseId,
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

    return this.withOrderNumber(po);
  }

  async confirm(id: string) {
    const po = await this.prisma.purchaseOrder.findUnique({ where: { id } });
    if (!po) throw new NotFoundException('Purchase order not found');
    if (po.status !== 'DRAFT') {
      throw new BadRequestException(`Cannot confirm a purchase order with status ${po.status}`);
    }
    const updated = await this.prisma.purchaseOrder.update({
      where: { id },
      data: { status: 'CONFIRMED' },
      include: { items: { include: { product: { select: { id: true, name: true, sku: true } } } } },
    });
    return this.withOrderNumber(updated);
  }

  async cancel(id: string) {
    const po = await this.prisma.purchaseOrder.findUnique({ where: { id }, include: { items: true } });
    if (!po) throw new NotFoundException('Purchase order not found');
    if (!['DRAFT', 'CONFIRMED'].includes(po.status)) {
      throw new BadRequestException(`Cannot cancel a purchase order with status ${po.status}`);
    }
    const anyReceived = po.items.some((i) => i.receivedQuantity > 0);
    if (anyReceived) {
      throw new BadRequestException('Cannot cancel a purchase order that already has received items');
    }
    const updated = await this.prisma.purchaseOrder.update({
      where: { id },
      data: { status: 'CANCELLED' },
    });
    return this.withOrderNumber(updated);
  }

  async receive(id: string, dto: ReceivePurchaseOrderDto, userId?: string) {
    const po = await this.prisma.purchaseOrder.findUnique({ where: { id }, include: { items: true } });
    if (!po) throw new NotFoundException('Purchase order not found');
    if (!['CONFIRMED', 'PARTIALLY_RECEIVED'].includes(po.status)) {
      throw new BadRequestException(
        `Cannot receive against a purchase order with status ${po.status}`,
      );
    }

    let batchTotal = 0;
    const receiptLines = dto.items.map((item) => {
      const poItem = po.items.find((i) => i.productId === item.productId);
      if (!poItem) {
        throw new BadRequestException(`Product ${item.productId} is not part of this purchase order`);
      }
      const remaining = poItem.orderedQuantity - poItem.receivedQuantity;
      if (item.quantity > remaining) {
        throw new BadRequestException(
          `Cannot receive ${item.quantity} of product ${item.productId}: only ${remaining} remaining`,
        );
      }

      const perUnitVat = Number(poItem.vatAmount) / poItem.orderedQuantity;
      const value = item.quantity * (Number(poItem.unitCost) + perUnitVat);
      batchTotal += value;

      return { poItemId: poItem.id, productId: item.productId, quantity: item.quantity, value };
    });

    const updated = await this.prisma.$transaction(async (tx) => {
      for (const line of receiptLines) {
        await tx.stock.upsert({
          where: {
            productId_warehouseId: { productId: line.productId, warehouseId: po.warehouseId },
          },
          update: { quantity: { increment: line.quantity } },
          create: { productId: line.productId, warehouseId: po.warehouseId, quantity: line.quantity },
        });

        const updatedStock = await tx.stock.findUniqueOrThrow({
          where: {
            productId_warehouseId: { productId: line.productId, warehouseId: po.warehouseId },
          },
        });

        await tx.stockMovement.create({
          data: {
            productId: line.productId,
            warehouseId: po.warehouseId,
            type: 'PURCHASE_IN',
            quantity: line.quantity,
            balanceAfter: updatedStock.quantity,
            referenceType: 'PurchaseOrder',
            referenceId: po.id,
            createdById: userId,
          },
        });

        await tx.purchaseOrderItem.update({
          where: { id: line.poItemId },
          data: { receivedQuantity: { increment: line.quantity } },
        });
      }

      const supplier = await tx.supplier.findUniqueOrThrow({ where: { id: po.supplierId } });
      const newBalance = Number(supplier.balance) + batchTotal;
      await tx.supplier.update({ where: { id: po.supplierId }, data: { balance: newBalance } });
      await tx.supplierTransaction.create({
        data: {
          supplierId: po.supplierId,
          type: 'PURCHASE',
          amount: batchTotal,
          balanceAfter: newBalance,
          referenceType: 'PurchaseOrder',
          referenceId: po.id,
          createdById: userId,
        },
      });

      const refreshedItems = await tx.purchaseOrderItem.findMany({ where: { purchaseOrderId: po.id } });
      const fullyReceived = refreshedItems.every((i) => i.receivedQuantity >= i.orderedQuantity);
      const newStatus = fullyReceived ? 'RECEIVED' : 'PARTIALLY_RECEIVED';

      return tx.purchaseOrder.update({
        where: { id: po.id },
        data: { status: newStatus },
        include: { items: { include: { product: { select: { id: true, name: true, sku: true } } } } },
      });
    });

    return this.withOrderNumber(updated);
  }

  async findAll(query: PurchaseQuery) {
    const page = query.page && query.page > 0 ? query.page : 1;
    const pageSize = query.pageSize && query.pageSize > 0 ? Math.min(query.pageSize, 100) : 25;

    const where = {
      supplierId: query.supplierId,
      branchId: query.branchId,
      status: query.status,
    };

    const [items, total] = await Promise.all([
      this.prisma.purchaseOrder.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
        include: {
          supplier: { select: { id: true, name: true } },
          branch: { select: { id: true, name: true } },
          warehouse: { select: { id: true, name: true } },
        },
      }),
      this.prisma.purchaseOrder.count({ where }),
    ]);

    return {
      items: items.map((po) => this.withOrderNumber(po)),
      total,
      page,
      pageSize,
      totalPages: Math.ceil(total / pageSize),
    };
  }

  async findOne(id: string) {
    const po = await this.prisma.purchaseOrder.findUnique({
      where: { id },
      include: {
        supplier: { select: { id: true, name: true } },
        branch: { select: { id: true, name: true } },
        warehouse: { select: { id: true, name: true } },
        items: { include: { product: { select: { id: true, name: true, sku: true, unit: true } } } },
      },
    });
    if (!po) throw new NotFoundException('Purchase order not found');
    return this.withOrderNumber(po);
  }
}
