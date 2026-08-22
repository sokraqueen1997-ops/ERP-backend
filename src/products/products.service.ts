import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateProductDto, UpdateProductDto } from './dto/product.dto';

export interface ProductQuery {
  search?: string;
  categoryId?: string;
  supplierId?: string;
  isActive?: boolean;
}

@Injectable()
export class ProductsService {
  constructor(private readonly prisma: PrismaService) {}

  findAll(query: ProductQuery) {
    return this.prisma.product.findMany({
      where: {
        isActive: query.isActive,
        categoryId: query.categoryId,
        supplierId: query.supplierId,
        ...(query.search
          ? {
              OR: [
                { name: { contains: query.search, mode: 'insensitive' } },
                { sku: { contains: query.search, mode: 'insensitive' } },
                { barcode: { contains: query.search, mode: 'insensitive' } },
              ],
            }
          : {}),
      },
      include: {
        category: { select: { id: true, name: true } },
        supplier: { select: { id: true, name: true } },
      },
      orderBy: { name: 'asc' },
    });
  }

  async findOne(id: string) {
    const product = await this.prisma.product.findUnique({
      where: { id },
      include: {
        category: { select: { id: true, name: true } },
        supplier: { select: { id: true, name: true } },
        stocks: {
          include: { warehouse: { select: { id: true, name: true, code: true } } },
        },
      },
    });
    if (!product) throw new NotFoundException('Product not found');
    return product;
  }

  async create(dto: CreateProductDto) {
    const [skuTaken, barcodeTaken, category] = await Promise.all([
      this.prisma.product.findUnique({ where: { sku: dto.sku } }),
      dto.barcode
        ? this.prisma.product.findUnique({ where: { barcode: dto.barcode } })
        : Promise.resolve(null),
      dto.categoryId
        ? this.prisma.category.findUnique({ where: { id: dto.categoryId } })
        : Promise.resolve(null),
    ]);
    if (skuTaken) throw new ConflictException('SKU already exists');
    if (barcodeTaken) throw new ConflictException('Barcode already exists');
    if (dto.categoryId && !category) throw new BadRequestException('Invalid categoryId');

    if (dto.supplierId) {
      const supplier = await this.prisma.supplier.findUnique({ where: { id: dto.supplierId } });
      if (!supplier) throw new BadRequestException('Invalid supplierId');
    }

    return this.prisma.product.create({
      data: dto,
      include: {
        category: { select: { id: true, name: true } },
        supplier: { select: { id: true, name: true } },
      },
    });
  }

  async update(id: string, dto: UpdateProductDto) {
    await this.findOne(id);

    if (dto.barcode) {
      const barcodeTaken = await this.prisma.product.findFirst({
        where: { barcode: dto.barcode, NOT: { id } },
      });
      if (barcodeTaken) throw new ConflictException('Barcode already exists');
    }
    if (dto.categoryId) {
      const category = await this.prisma.category.findUnique({ where: { id: dto.categoryId } });
      if (!category) throw new BadRequestException('Invalid categoryId');
    }
    if (dto.supplierId) {
      const supplier = await this.prisma.supplier.findUnique({ where: { id: dto.supplierId } });
      if (!supplier) throw new BadRequestException('Invalid supplierId');
    }

    return this.prisma.product.update({
      where: { id },
      data: dto,
      include: {
        category: { select: { id: true, name: true } },
        supplier: { select: { id: true, name: true } },
      },
    });
  }

  /** Soft-delete: products with stock history should never be hard-deleted. */
  async remove(id: string) {
    await this.findOne(id);
    return this.prisma.product.update({ where: { id }, data: { isActive: false } });
  }
}
