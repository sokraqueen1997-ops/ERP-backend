import { IsInt, IsNotEmpty, IsOptional, IsString, IsUUID, NotEquals } from 'class-validator';

export class AdjustStockDto {
  @IsUUID()
  productId!: string;

  @IsUUID()
  warehouseId!: string;

  /** Signed delta: positive increases stock, negative decreases it. */
  @IsInt()
  @NotEquals(0)
  quantityChange!: number;

  @IsOptional()
  @IsString()
  notes?: string;
}

export class StockQueryDto {
  @IsOptional()
  @IsUUID()
  productId?: string;

  @IsOptional()
  @IsUUID()
  warehouseId?: string;
}
