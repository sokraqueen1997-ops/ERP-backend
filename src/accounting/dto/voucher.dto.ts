import { IsIn, IsOptional, IsPositive, IsString, IsUUID } from 'class-validator';

const RECEIPT_CATEGORIES = ['SALES_COLLECTION', 'OWNER_DEPOSIT', 'OTHER_INCOME', 'OPENING_BALANCE', 'OTHER'];
const PAYMENT_CATEGORIES = ['SUPPLIER_PAYMENT', 'EXPENSE', 'OWNER_WITHDRAWAL', 'OTHER'];

export class CreateReceiptDto {
  @IsPositive()
  amount!: number;

  @IsOptional()
  @IsIn(RECEIPT_CATEGORIES)
  category?: string;

  @IsOptional()
  @IsString()
  description?: string;

  /** If set, also posts a matching PAYMENT entry on this customer's own ledger. */
  @IsOptional()
  @IsUUID()
  relatedCustomerId?: string;
}

export class CreatePaymentDto {
  @IsPositive()
  amount!: number;

  @IsOptional()
  @IsIn(PAYMENT_CATEGORIES)
  category?: string;

  @IsOptional()
  @IsString()
  description?: string;

  /** If set, also posts a matching PAYMENT entry on this supplier's own ledger. */
  @IsOptional()
  @IsUUID()
  relatedSupplierId?: string;
}
