import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateStockCountDto, UpdateStockCountLinesDto } from './dto/stock-count.dto';

export interface StockCountQuery {
  warehouseId?: string;
  status?: string;
  page?: number;
  pageSize?: number;
}

@Injectable()
export class StockCountService {
  constructor(private readonly prisma: PrismaService) {}

  private static countNumber(countSeq: number): string {
    return `SC-${String(countSeq).padStart(6, '0')}`;
  }

  private withCountNumber<T extends { countSeq: number }>(c: T) {
    return { ...c, countNumber: StockCountService.countNumber(c.countSeq) };
  }

  async create(dto: CreateStockCountDto, userId?: string) {
    const warehouse = await this.prisma.warehouse.findUnique({ where: { id: dto.warehouseId } });
    if (!warehouse) throw new BadRequestException('Invalid warehouseId');

    const stocks = await this.prisma.stock.findMany({
      where: {
        warehouseId: dto.warehouseId,
        ...(dto.productIds ? { productId: { in: dto.productIds } } : {}),
      },
    });

    if (dto.productIds && stocks.length !== dto.productIds.length) {
      const found = new Set(stocks.map((s) => s.productId));
      const missing = dto.productIds.filter((id) => !found.has(id));
      throw new BadRequestException(
        `No stock record in this warehouse for product id(s): ${missing.join(', ')}`,
      );
    }
    if (stocks.length === 0) {
      throw new BadRequestException('No stock records found for this warehouse (or the given products)');
    }

    const count = await this.prisma.stockCount.create({
      data: {
        warehouseId: dto.warehouseId,
        type: dto.type,
        notes: dto.notes,
        createdById: userId,
        lines: {
          create: stocks.map((s) => ({ productId: s.productId, expectedQty: s.quantity })),
        },
      },
      include: { lines: { include: { product: { select: { id: true, name: true, sku: true, unit: true } } } } },
    });

    return this.withCountNumber(count);
  }

  /** Enter/update counted quantities. Can be called multiple times while the count is OPEN. */
  async updateLines(id: string, dto: UpdateStockCountLinesDto) {
    const count = await this.prisma.stockCount.findUnique({ where: { id }, include: { lines: true } });
    if (!count) throw new NotFoundException('Stock count not found');
    if (count.status !== 'OPEN') {
      throw new BadRequestException(`Cannot enter counts for a stock count with status ${count.status}`);
    }

    const lineByProduct = new Map(count.lines.map((l) => [l.productId, l] as const));

    await this.prisma.$transaction(
      dto.lines.map((input) => {
        const line = lineByProduct.get(input.productId);
        if (!line) {
          throw new BadRequestException(`Product ${input.productId} is not part of this stock count`);
        }
        return this.prisma.stockCountLine.update({
          where: { id: line.id },
          data: { countedQty: input.countedQty, variance: input.countedQty - line.expectedQty },
        });
      }),
    );

    return this.findOne(id);
  }

  /** Applies any variance as stock adjustments and closes the count. Requires every line to have been counted. */
  async complete(id: string, userId?: string) {
    const count = await this.prisma.stockCount.findUnique({
      where: { id },
      include: { lines: { include: { product: { select: { id: true, name: true } } } } },
    });
    if (!count) throw new NotFoundException('Stock count not found');
    if (count.status !== 'OPEN') {
      throw new BadRequestException(`Cannot complete a stock count with status ${count.status}`);
    }

    const uncounted = count.lines.filter((l) => l.countedQty === null);
    if (uncounted.length > 0) {
      throw new BadRequestException(
        `Cannot complete: ${uncounted.length} product(s) not yet counted: ${uncounted
          .map((l) => l.product.name)
          .join(', ')}`,
      );
    }

    const updated = await this.prisma.$transaction(async (tx) => {
      for (const line of count.lines) {
        if (!line.variance) continue; // variance === 0, nothing to adjust

        await tx.stock.update({
          where: {
            productId_warehouseId: { productId: line.productId, warehouseId: count.warehouseId },
          },
          data: { quantity: line.countedQty as number },
        });

        await tx.stockMovement.create({
          data: {
            productId: line.productId,
            warehouseId: count.warehouseId,
            type: 'COUNT_ADJUSTMENT',
            quantity: line.variance,
            balanceAfter: line.countedQty as number,
            referenceType: 'StockCount',
            referenceId: count.id,
            createdById: userId,
          },
        });
      }

      return tx.stockCount.update({
        where: { id },
        data: { status: 'COMPLETED', completedAt: new Date() },
        include: { lines: { include: { product: { select: { id: true, name: true, sku: true, unit: true } } } } },
      });
    });

    return this.withCountNumber(updated);
  }

  async cancel(id: string) {
    const count = await this.prisma.stockCount.findUnique({ where: { id } });
    if (!count) throw new NotFoundException('Stock count not found');
    if (count.status !== 'OPEN') {
      throw new BadRequestException(`Cannot cancel a stock count with status ${count.status}`);
    }
    const updated = await this.prisma.stockCount.update({ where: { id }, data: { status: 'CANCELLED' } });
    return this.withCountNumber(updated);
  }

  async findAll(query: StockCountQuery) {
    const page = query.page && query.page > 0 ? query.page : 1;
    const pageSize = query.pageSize && query.pageSize > 0 ? Math.min(query.pageSize, 100) : 25;

    const where = { warehouseId: query.warehouseId, status: query.status };

    const [items, total] = await Promise.all([
      this.prisma.stockCount.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
        include: { warehouse: { select: { id: true, name: true } } },
      }),
      this.prisma.stockCount.count({ where }),
    ]);

    return {
      items: items.map((c) => this.withCountNumber(c)),
      total,
      page,
      pageSize,
      totalPages: Math.ceil(total / pageSize),
    };
  }

  async findOne(id: string) {
    const count = await this.prisma.stockCount.findUnique({
      where: { id },
      include: {
        warehouse: { select: { id: true, name: true } },
        lines: { include: { product: { select: { id: true, name: true, sku: true, unit: true } } } },
      },
    });
    if (!count) throw new NotFoundException('Stock count not found');
    return this.withCountNumber(count);
  }
}
