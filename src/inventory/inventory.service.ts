import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AdjustStockDto } from './dto/inventory.dto';

export interface MovementQuery {
  productId?: string;
  warehouseId?: string;
  type?: string;
  page?: number;
  pageSize?: number;
}

@Injectable()
export class InventoryService {
  constructor(private readonly prisma: PrismaService) {}

  findStock(productId?: string, warehouseId?: string) {
    return this.prisma.stock.findMany({
      where: { productId, warehouseId },
      include: {
        product: { select: { id: true, name: true, sku: true, minStockLevel: true, unit: true } },
        warehouse: { select: { id: true, name: true, code: true } },
      },
      orderBy: { updatedAt: 'desc' },
    });
  }

  async findLowStock() {
    const stocks = await this.prisma.stock.findMany({
      include: {
        product: { select: { id: true, name: true, sku: true, minStockLevel: true, unit: true, isActive: true } },
        warehouse: { select: { id: true, name: true, code: true } },
      },
    });
    return stocks.filter(
      (s) => s.product.isActive && s.quantity <= s.product.minStockLevel,
    );
  }

  async adjustStock(dto: AdjustStockDto, userId?: string) {
    const [product, warehouse] = await Promise.all([
      this.prisma.product.findUnique({ where: { id: dto.productId } }),
      this.prisma.warehouse.findUnique({ where: { id: dto.warehouseId } }),
    ]);
    if (!product) throw new BadRequestException('Invalid productId');
    if (!warehouse) throw new BadRequestException('Invalid warehouseId');

    return this.prisma.$transaction(async (tx) => {
      const existingStock = await tx.stock.findUnique({
        where: { productId_warehouseId: { productId: dto.productId, warehouseId: dto.warehouseId } },
      });

      const currentQuantity = existingStock?.quantity ?? 0;
      const newQuantity = currentQuantity + dto.quantityChange;

      if (newQuantity < 0) {
        throw new BadRequestException(
          `Adjustment would result in negative stock (current: ${currentQuantity}, change: ${dto.quantityChange})`,
        );
      }

      const stock = await tx.stock.upsert({
        where: { productId_warehouseId: { productId: dto.productId, warehouseId: dto.warehouseId } },
        update: { quantity: newQuantity },
        create: { productId: dto.productId, warehouseId: dto.warehouseId, quantity: newQuantity },
      });

      const movement = await tx.stockMovement.create({
        data: {
          productId: dto.productId,
          warehouseId: dto.warehouseId,
          type: dto.quantityChange > 0 ? 'ADJUSTMENT_IN' : 'ADJUSTMENT_OUT',
          quantity: dto.quantityChange,
          balanceAfter: newQuantity,
          referenceType: 'Manual',
          notes: dto.notes,
          createdById: userId,
        },
      });

      return { stock, movement };
    });
  }

  async findMovements(query: MovementQuery) {
    const page = query.page && query.page > 0 ? query.page : 1;
    const pageSize = query.pageSize && query.pageSize > 0 ? Math.min(query.pageSize, 100) : 25;

    const where = {
      productId: query.productId,
      warehouseId: query.warehouseId,
      type: query.type,
    };

    const [items, total] = await Promise.all([
      this.prisma.stockMovement.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
        include: {
          product: { select: { id: true, name: true, sku: true } },
          warehouse: { select: { id: true, name: true, code: true } },
        },
      }),
      this.prisma.stockMovement.count({ where }),
    ]);

    return { items, total, page, pageSize, totalPages: Math.ceil(total / pageSize) };
  }
}
