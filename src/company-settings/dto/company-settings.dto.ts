import { IsOptional, IsString, Matches, MinLength } from 'class-validator';

export class UpdateCompanySettingsDto {
  @IsString()
  @MinLength(2)
  legalNameAr!: string;

  @IsOptional()
  @IsString()
  legalNameEn?: string;

  /** 15-digit VAT registration number issued by ZATCA. */
  @IsString()
  @Matches(/^\d{15}$/, { message: 'vatNumber must be exactly 15 digits' })
  vatNumber!: string;

  @IsOptional()
  @IsString()
  crNumber?: string;

  @IsOptional()
  @IsString()
  buildingNumber?: string;

  @IsOptional()
  @IsString()
  streetName?: string;

  @IsOptional()
  @IsString()
  district?: string;

  @IsOptional()
  @IsString()
  city?: string;

  @IsOptional()
  @IsString()
  postalCode?: string;

  @IsOptional()
  @IsString()
  additionalNumber?: string;
}
