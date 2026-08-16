import { IsBoolean, IsIn, IsNumber, IsOptional, IsString, Min, MinLength } from 'class-validator';

const ACCOUNT_TYPES = ['CASH', 'BANK'];

export class CreateAccountDto {
  @IsString()
  @MinLength(2)
  name!: string;

  @IsIn(ACCOUNT_TYPES)
  type!: string;

  @IsOptional()
  @IsString()
  bankName?: string;

  @IsOptional()
  @IsString()
  accountNumber?: string;

  @IsOptional()
  @IsString()
  iban?: string;

  /** Starting balance, recorded as an opening ADJUSTMENT receipt. */
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  openingBalance?: number;
}

export class UpdateAccountDto {
  @IsOptional()
  @IsString()
  @MinLength(2)
  name?: string;

  @IsOptional()
  @IsString()
  bankName?: string;

  @IsOptional()
  @IsString()
  accountNumber?: string;

  @IsOptional()
  @IsString()
  iban?: string;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
