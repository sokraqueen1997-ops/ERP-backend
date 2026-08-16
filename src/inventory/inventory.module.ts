import { Module } from '@nestjs/common';
import { InventoryService } from './inventory.service';
import { InventoryController } from './inventory.controller';
import { TransfersService } from './transfers.service';
import { TransfersController } from './transfers.controller';
import { StockCountService } from './stock-count.service';
import { StockCountController } from './stock-count.controller';

@Module({
  controllers: [InventoryController, TransfersController, StockCountController],
  providers: [InventoryService, TransfersService, StockCountService],
  exports: [InventoryService, TransfersService, StockCountService],
})
export class InventoryModule {}
