import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { UpdateCompanySettingsDto } from './dto/company-settings.dto';

const SINGLETON_ID = 'singleton';

@Injectable()
export class CompanySettingsService {
  constructor(private readonly prisma: PrismaService) {}

  async get() {
    const settings = await this.prisma.companySettings.findUnique({ where: { id: SINGLETON_ID } });
    if (!settings) {
      throw new NotFoundException(
        'Company tax settings have not been configured yet. Set them via PATCH /company-settings before generating ZATCA QR codes or invoice XML.',
      );
    }
    return settings;
  }

  /** Returns null instead of throwing — used internally by other services that should degrade gracefully. */
  async findOrNull() {
    return this.prisma.companySettings.findUnique({ where: { id: SINGLETON_ID } });
  }

  update(dto: UpdateCompanySettingsDto) {
    return this.prisma.companySettings.upsert({
      where: { id: SINGLETON_ID },
      update: dto,
      create: { id: SINGLETON_ID, ...dto },
    });
  }
}
