import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateWarehouseDto, UpdateWarehouseDto } from './dto/warehouse.dto';

@Injectable()
export class WarehousesService {
  constructor(private readonly prisma: PrismaService) {}

  findAll() {
    return this.prisma.warehouse.findMany({
      include: { branch: { select: { id: true, name: true, code: true } } },
      orderBy: { name: 'asc' },
    });
  }

  async findOne(id: string) {
    const warehouse = await this.prisma.warehouse.findUnique({
      where: { id },
      include: { branch: { select: { id: true, name: true, code: true } } },
    });
    if (!warehouse) throw new NotFoundException('Warehouse not found');
    return warehouse;
  }

  async create(dto: CreateWarehouseDto) {
    const [codeTaken, branch] = await Promise.all([
      this.prisma.warehouse.findUnique({ where: { code: dto.code } }),
      this.prisma.branch.findUnique({ where: { id: dto.branchId } }),
    ]);
    if (codeTaken) throw new ConflictException('Warehouse code already exists');
    if (!branch) throw new BadRequestException('Invalid branchId');

    return this.prisma.warehouse.create({ data: dto });
  }

  async update(id: string, dto: UpdateWarehouseDto) {
    await this.findOne(id);
    if (dto.branchId) {
      const branch = await this.prisma.branch.findUnique({ where: { id: dto.branchId } });
      if (!branch) throw new BadRequestException('Invalid branchId');
    }
    return this.prisma.warehouse.update({ where: { id }, data: dto });
  }

  async remove(id: string) {
    await this.findOne(id);
    const stockCount = await this.prisma.stock.count({
      where: { warehouseId: id, quantity: { not: 0 } },
    });
    if (stockCount > 0) {
      throw new ConflictException('Cannot delete a warehouse that still holds stock');
    }
    await this.prisma.warehouse.delete({ where: { id } });
    return { success: true };
  }
}
