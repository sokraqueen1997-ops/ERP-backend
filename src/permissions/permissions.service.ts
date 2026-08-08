import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class PermissionsService {
  constructor(private readonly prisma: PrismaService) {}

  findAll() {
    return this.prisma.permission.findMany({ orderBy: [{ module: 'asc' }, { key: 'asc' }] });
  }

  groupedByModule() {
    return this.findAll().then((permissions) => {
      const grouped: Record<string, typeof permissions> = {};
      for (const perm of permissions) {
        grouped[perm.module] = grouped[perm.module] ?? [];
        grouped[perm.module].push(perm);
      }
      return grouped;
    });
  }
}
