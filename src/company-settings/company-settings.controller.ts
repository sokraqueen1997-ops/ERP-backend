import { Body, Controller, Get, Patch } from '@nestjs/common';
import { RequirePermissions } from '../common/decorators/permissions.decorator';
import { CompanySettingsService } from './company-settings.service';
import { UpdateCompanySettingsDto } from './dto/company-settings.dto';

@Controller('company-settings')
export class CompanySettingsController {
  constructor(private readonly companySettingsService: CompanySettingsService) {}

  @Get()
  @RequirePermissions('settings.manage')
  get() {
    return this.companySettingsService.get();
  }

  @Patch()
  @RequirePermissions('settings.manage')
  update(@Body() dto: UpdateCompanySettingsDto) {
    return this.companySettingsService.update(dto);
  }
}
