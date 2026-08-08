import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsDateString,
  IsIn,
  IsInt,
  IsOptional,
  IsPositive,
  IsString,
  IsUUID,
  Min,
  ValidateNested,
} from 'class-validator';

export class QuotationItemDto {
  @IsUUID()
  productId!: string;

  @IsInt()
  @IsPositive()
  quantity!: number;

  /** Optional manual override for negotiation. Defaults to the customer's price tier. */
  @IsOptional()
  @IsPositive()
  unitPrice?: number;

  @IsOptional()
  @Min(0)
  discountAmount?: number;
}

export class CreateQuotationDto {
  @IsUUID()
  customerId!: string;

  @IsUUID()
  branchId!: string;

  @IsDateString()
  validUntil!: string;

  @IsOptional()
  @Min(0)
  discountAmount?: number;

  @IsOptional()
  @IsString()
  notes?: string;

  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => QuotationItemDto)
  items!: QuotationItemDto[];
}

// Used both for editing a DRAFT quotation in place and for creating a new
// version via /revise (same shape: full replacement of validUntil/items/etc).
export class UpdateQuotationDto extends CreateQuotationDto {}

const PAYMENT_METHODS = ['CASH', 'CARD', 'BANK_TRANSFER', 'CREDIT'];

export class ConvertQuotationDto {
  @IsUUID()
  warehouseId!: string;

  @IsIn(PAYMENT_METHODS)
  paymentMethod!: string;
}
