import { IsBoolean, IsEmail, IsIn, IsNumber, IsOptional, IsString, MinLength } from 'class-validator';

export class CreateSupplierDto {
  @IsString()
  @MinLength(2)
  name!: string;

  @IsOptional()
  @IsString()
  phone?: string;

  @IsOptional()
  @IsEmail()
  email?: string;

  @IsOptional()
  @IsString()
  address?: string;
}

export class UpdateSupplierDto {
  @IsOptional()
  @IsString()
  @MinLength(2)
  name?: string;

  @IsOptional()
  @IsString()
  phone?: string;

  @IsOptional()
  @IsEmail()
  email?: string;

  @IsOptional()
  @IsString()
  address?: string;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

const SUPPLIER_TRANSACTION_TYPES = ['OPENING_BALANCE', 'PAYMENT', 'DEBIT_NOTE', 'ADJUSTMENT'];

export class CreateSupplierTransactionDto {
  @IsIn(SUPPLIER_TRANSACTION_TYPES)
  type!: string;

  /** Signed: positive increases what we owe the supplier, negative decreases it. */
  @IsNumber({ maxDecimalPlaces: 2 })
  amount!: number;

  @IsOptional()
  @IsString()
  notes?: string;
}
