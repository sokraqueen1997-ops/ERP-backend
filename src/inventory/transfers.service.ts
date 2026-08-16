import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateStockTransferDto } from './dto/transfer.dto';

export interface TransferQuery {
  fromWarehouseId?: string;
  toWarehouseId?: string;
  status?: string;
  page?: number;
  pageSize?: number;
}

@Injectable()
export class TransfersService {
  constructor(private readonly prisma: PrismaService) {}

  private static transferNumber(transferSeq: number): string {
    return `TR-${String(transferSeq).padStart(6, '0')}`;
  }

  private withTransferNumber<T extends { transferSeq: number }>(t: T) {
    return { ...t, transferNumber: TransfersService.transferNumber(t.transferSeq) };
  }

  async create(dto: CreateStockTransferDto, userId?: string) {
    if (dto.fromWarehouseId === dto.toWarehouseId) {
      throw new BadRequestException('fromWarehouseId and toWarehouseId must differ');
    }

    const [fromWarehouse, toWarehouse] = await Promise.all([
      this.prisma.warehouse.findUnique({ where: { id: dto.fromWarehouseId } }),
      this.prisma.warehouse.findUnique({ where: { id: dto.toWarehouseId } }),
    ]);
    if (!fromWarehouse) throw new BadRequestException('Invalid fromWarehouseId');
    if (!toWarehouse) throw new BadRequestException('Invalid toWarehouseId');

    const productIds = dto.items.map((i) => i.productId);
    const products = await this.prisma.product.findMany({ where: { id: { in: productIds } } });
    const productMap = new Map(products.map((p) => [p.id, p] as const));

    for (const item of dto.items) {
      const product = productMap.get(item.productId);
      if (!product || !product.isActive) {
        throw new BadRequestException(`Invalid or inactive productId: ${item.productId}`);
      }
    }

    const transfer = await this.prisma.stockTransfer.create({
      data: {
        fromWarehouseId: dto.fromWarehouseId,
        toWarehouseId: dto.toWarehouseId,
        notes: dto.notes,
        createdById: userId,
        items: { create: dto.items.map((i) => ({ productId: i.productId, quantity: i.quantity })) },
      },
      include: { items: { include: { product: { select: { id: true, name: true, sku: true } } } } },
    });

    return this.withTransferNumber(transfer);
  }

  /** Ships the transfer: deducts stock from the source warehouse. */
  async ship(id: string, userId?: string) {
    const transfer = await this.prisma.stockTransfer.findUnique({ where: { id }, include: { items: true } });
    if (!transfer) throw new NotFoundException('Stock transfer not found');
    if (transfer.status !== 'PENDING') {
      throw new BadRequestException(`Cannot ship a transfer with status ${transfer.status}`);
    }

    const stocks = await this.prisma.stock.findMany({
      where: {
        warehouseId: transfer.fromWarehouseId,
        productId: { in: transfer.items.map((i) => i.productId) },
      },
    });
    const stockMap = new Map(stocks.map((s) => [s.productId, s.quantity] as const));

    for (const item of transfer.items) {
      const available = stockMap.get(item.productId) ?? 0;
      if (available < item.quantity) {
        throw new BadRequestException(
          `Insufficient stock for product ${item.productId} in source warehouse: available ${available}, requested ${item.quantity}`,
        );
      }
    }

    const updated = await this.prisma.$transaction(async (tx) => {
      for (const item of transfer.items) {
        await tx.stock.update({
          where: {
            productId_warehouseId: { productId: item.productId, warehouseId: transfer.fromWarehouseId },
          },
          data: { quantity: { decrement: item.quantity } },
        });

        const updatedStock = await tx.stock.findUniqueOrThrow({
          where: {
            productId_warehouseId: { productId: item.productId, warehouseId: transfer.fromWarehouseId },
          },
        });

        await tx.stockMovement.create({
          data: {
            productId: item.productId,
            warehouseId: transfer.fromWarehouseId,
            type: 'TRANSFER_OUT',
            quantity: -item.quantity,
            balanceAfter: updatedStock.quantity,
            referenceType: 'StockTransfer',
            referenceId: transfer.id,
            createdById: userId,
          },
        });
      }

      return tx.stockTransfer.update({
        where: { id },
        data: { status: 'IN_TRANSIT', shippedAt: new Date() },
        include: { items: { include: { product: { select: { id: true, name: true, sku: true } } } } },
      });
    });

    return this.withTransferNumber(updated);
  }

  /** Receives the transfer at the destination warehouse: adds the stock there. */
  async receive(id: string, userId?: string) {
    const transfer = await this.prisma.stockTransfer.findUnique({ where: { id }, include: { items: true } });
    if (!transfer) throw new NotFoundException('Stock transfer not found');
    if (transfer.status !== 'IN_TRANSIT') {
      throw new BadRequestException(`Cannot receive a transfer with status ${transfer.status}`);
    }

    const updated = await this.prisma.$transaction(async (tx) => {
      for (const item of transfer.items) {
        await tx.stock.upsert({
          where: {
            productId_warehouseId: { productId: item.productId, warehouseId: transfer.toWarehouseId },
          },
          update: { quantity: { increment: item.quantity } },
          create: { productId: item.productId, warehouseId: transfer.toWarehouseId, quantity: item.quantity },
        });

        const updatedStock = await tx.stock.findUniqueOrThrow({
          where: {
            productId_warehouseId: { productId: item.productId, warehouseId: transfer.toWarehouseId },
          },
        });

        await tx.stockMovement.create({
          data: {
            productId: item.productId,
            warehouseId: transfer.toWarehouseId,
            type: 'TRANSFER_IN',
            quantity: item.quantity,
            balanceAfter: updatedStock.quantity,
            referenceType: 'StockTransfer',
            referenceId: transfer.id,
            createdById: userId,
          },
        });
      }

      return tx.stockTransfer.update({
        where: { id },
        data: { status: 'COMPLETED', receivedAt: new Date() },
        include: { items: { include: { product: { select: { id: true, name: true, sku: true } } } } },
      });
    });

    return this.withTransferNumber(updated);
  }

  async cancel(id: string) {
    const transfer = await this.prisma.stockTransfer.findUnique({ where: { id } });
    if (!transfer) throw new NotFoundException('Stock transfer not found');
    if (transfer.status !== 'PENDING') {
      throw new BadRequestException(`Cannot cancel a transfer with status ${transfer.status}`);
    }
    const updated = await this.prisma.stockTransfer.update({ where: { id }, data: { status: 'CANCELLED' } });
    return this.withTransferNumber(updated);
  }

  async findAll(query: TransferQuery) {
    const page = query.page && query.page > 0 ? query.page : 1;
    const pageSize = query.pageSize && query.pageSize > 0 ? Math.min(query.pageSize, 100) : 25;

    const where = {
      fromWarehouseId: query.fromWarehouseId,
      toWarehouseId: query.toWarehouseId,
      status: query.status,
    };

    const [items, total] = await Promise.all([
      this.prisma.stockTransfer.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
        include: {
          fromWarehouse: { select: { id: true, name: true } },
          toWarehouse: { select: { id: true, name: true } },
        },
      }),
      this.prisma.stockTransfer.count({ where }),
    ]);

    return {
      items: items.map((t) => this.withTransferNumber(t)),
      total,
      page,
      pageSize,
      totalPages: Math.ceil(total / pageSize),
    };
  }

  async findOne(id: string) {
    const transfer = await this.prisma.stockTransfer.findUnique({
      where: { id },
      include: {
        fromWarehouse: { select: { id: true, name: true } },
        toWarehouse: { select: { id: true, name: true } },
        items: { include: { product: { select: { id: true, name: true, sku: true, unit: true } } } },
      },
    });
    if (!transfer) throw new NotFoundException('Stock transfer not found');
    return this.withTransferNumber(transfer);
  }
}
