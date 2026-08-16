import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Min,
  ValidateNested,
} from 'class-validator';

const COUNT_TYPES = ['PERIODIC', 'SURPRISE'];

export class CreateStockCountDto {
  @IsUUID()
  warehouseId!: string;

  @IsIn(COUNT_TYPES)
  type!: string;

  /** Optional: count only these products. Omit to count every product currently stocked in the warehouse. */
  @IsOptional()
  @IsArray()
  @IsUUID('4', { each: true })
  productIds?: string[];

  @IsOptional()
  @IsString()
  notes?: string;
}

export class StockCountLineInputDto {
  @IsUUID()
  productId!: string;

  @IsInt()
  @Min(0)
  countedQty!: number;
}

export class UpdateStockCountLinesDto {
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => StockCountLineInputDto)
  lines!: StockCountLineInputDto[];
}
